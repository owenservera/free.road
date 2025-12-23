// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title FinallicaPrivacyRouter
 * @notice Optional privacy layer using Tornado Cash for BLF token and ETH transfers
 * @dev Users opt-in to privacy features; nothing is mandatory
 * @custom:security-contact security@finallica.io
 */
contract FinallicaPrivacyRouter is Ownable, ReentrancyGuard {
    /// @notice BLF governance token address
    address public blfToken;

    /// @notice Tornado Cash instance addresses (configurable)
    mapping(address => bool) public authorizedTornadoInstances;

    /// @notice Privacy pool configurations
    struct PrivacyPool {
        address tornadoInstance;
        uint256 denomination;
        address token; // address(0) for ETH, token address for ERC20
        bool isActive;
    }

    /// @notice Pool ID to PrivacyPool mapping
    mapping(bytes32 => PrivacyPool) public privacyPools;

    /// @notice List of all pool IDs
    bytes32[] public poolList;

    /// @notice Relayer registry for feeless withdrawals
    mapping(address => bool) public authorizedRelayers;

    /// @notice Minimum privacy fee (basis points)
    uint256 public constant MIN_PRIVACY_FEE = 10; // 0.1%

    /// @notice Maximum privacy fee (basis points)
    uint256 public constant MAX_PRIVACY_FEE = 100; // 1%

    /// @notice Protocol fee for privacy services
    uint256 public protocolFeeBps = 25; // 0.25%

    /// @notice Accumulated protocol fees
    mapping(address => uint256) public accumulatedFees;

    // ============================================
    // EVENTS
    // ============================================

    event PrivateDeposit(
        bytes32 indexed poolId,
        address indexed depositor,
        uint256 amount,
        bytes32 commitment
    );

    event PrivateWithdrawal(
        bytes32 indexed poolId,
        address indexed recipient,
        uint256 amount,
        address relayer,
        uint256 fee
    );

    event PrivacyPoolAdded(
        bytes32 indexed poolId,
        address tornadoInstance,
        uint256 denomination,
        address token
    );

    event PrivacyPoolRemoved(bytes32 indexed poolId);

    event PrivacyPoolDeactivated(bytes32 indexed poolId);

    event RelayerAdded(address indexed relayer);
    event RelayerRemoved(address indexed relayer);

    event FeesCollected(address indexed token, uint256 amount);
    event FeesWithdrawn(address indexed token, address indexed to, uint256 amount);

    event ProtocolFeeUpdated(uint256 newFeeBps);

    // ============================================
    // ERRORS
    // ============================================

    error PoolNotFound();
    error PoolNotActive();
    error InvalidAmount();
    error InvalidToken();
    error UnauthorizedInstance();
    error UnauthorizedRelayer();
    error InvalidFee();
    error TransferFailed();

    // ============================================
    // CONSTRUCTOR
    // ============================================

    constructor(address _blfToken) Ownable(msg.sender) {
        blfToken = _blfToken;
    }

    // ============================================
    // DEPOSIT FUNCTIONS
    // ============================================

    /**
     * @notice Deposit to Tornado Cash for privacy (ETH)
     * @param poolId The privacy pool to use
     * @param commitment The commitment hash (generated off-chain)
     */
    function privateDepositETH(
        bytes32 poolId,
        bytes32 commitment
    ) external payable nonReentrant {
        PrivacyPool storage pool = privacyPools[poolId];
        if (!pool.isActive) revert PoolNotActive();
        if (pool.token != address(0)) revert InvalidToken();
        if (msg.value != pool.denomination) revert InvalidAmount();

        (bool success, ) = pool.tornadoInstance.call{value: msg.value}(
            abi.encodeWithSignature("deposit(bytes32)", commitment)
        );
        if (!success) revert TransferFailed();

        emit PrivateDeposit(poolId, msg.sender, pool.denomination, commitment);
    }

    /**
     * @notice Deposit to Tornado Cash for privacy (ERC20)
     * @param poolId The privacy pool to use
     * @param commitment The commitment hash (generated off-chain)
     */
    function privateDepositERC20(
        bytes32 poolId,
        bytes32 commitment
    ) external nonReentrant {
        PrivacyPool storage pool = privacyPools[poolId];
        if (!pool.isActive) revert PoolNotActive();
        if (pool.token == address(0)) revert InvalidToken();

        uint256 denomination = pool.denomination;

        // Transfer tokens from sender to this contract, then to Tornado
        IERC20 token = IERC20(pool.token);
        uint256 balanceBefore = token.balanceOf(pool.tornadoInstance);

        bool success = token.transferFrom(msg.sender, pool.tornadoInstance, denomination);
        if (!success) revert TransferFailed();

        // Verify transfer succeeded
        uint256 balanceAfter = token.balanceOf(pool.tornadoInstance);
        if (balanceAfter != balanceBefore + denomination) revert TransferFailed();

        // Call Tornado deposit function
        (success, ) = pool.tornadoInstance.call(
            abi.encodeWithSignature("deposit(bytes32)", commitment)
        );
        if (!success) revert TransferFailed();

        emit PrivateDeposit(poolId, msg.sender, denomination, commitment);
    }

    /**
     * @notice Batch deposit multiple amounts for enhanced privacy
     * @param poolIds Array of pool IDs
     * @param commitments Array of commitments
     */
    function privateDepositBatch(
        bytes32[] calldata poolIds,
        bytes32[] calldata commitments
    ) external payable nonReentrant {
        require(poolIds.length == commitments.length, "Length mismatch");

        uint256 totalEthValue = 0;

        for (uint256 i = 0; i < poolIds.length; i++) {
            PrivacyPool storage pool = privacyPools[poolIds[i]];
            if (!pool.isActive) revert PoolNotActive();

            if (pool.token == address(0)) {
                totalEthValue += pool.denomination;
            } else {
                // ERC20 handling
                IERC20 token = IERC20(pool.token);
                bool success = token.transferFrom(
                    msg.sender,
                    pool.tornadoInstance,
                    pool.denomination
                );
                if (!success) revert TransferFailed();
            }

            (bool success, ) = pool.tornadoInstance.call{value: pool.token == address(0) ? pool.denomination : 0}(
                abi.encodeWithSignature("deposit(bytes32)", commitments[i])
            );
            if (!success) revert TransferFailed();

            emit PrivateDeposit(poolIds[i], msg.sender, pool.denomination, commitments[i]);
        }

        if (totalEthValue > msg.value) revert InvalidAmount();
    }

    // ============================================
    // WITHDRAWAL FUNCTIONS
    // ============================================

    /**
     * @notice Withdraw through relayer for privacy (direct)
     * @param poolId The privacy pool
     * @param proof ZK-SNARK proof
     * @param root Merkle root
     * @param nullifierHash Nullifier hash
     * @param recipient Withdrawal recipient
     * @param relayer Relayer address (for fee)
     * @param fee Relayer fee
     * @param refund Refund amount
     */
    function privateWithdraw(
        bytes32 poolId,
        bytes calldata proof,
        bytes32 root,
        bytes32 nullifierHash,
        address payable recipient,
        address payable relayer,
        uint256 fee,
        uint256 refund
    ) external nonReentrant {
        PrivacyPool storage pool = privacyPools[poolId];
        if (!pool.isActive) revert PoolNotActive();

        // Calculate protocol fee
        uint256 protocolFee = (pool.denomination * protocolFeeBps) / 10000;
        uint256 totalFee = fee + protocolFee;

        // Execute withdrawal through Tornado
        (bool success, ) = pool.tornadoInstance.call{value: pool.token == address(0) ? pool.denomination : 0}(
            abi.encodeWithSignature(
                "withdraw(bytes,bytes32,bytes32,address,address,uint256,uint256)",
                proof, root, nullifierHash, recipient, relayer, totalFee, refund
            )
        );
        if (!success) revert TransferFailed();

        // Track protocol fee for ERC20 pools
        if (pool.token != address(0)) {
            accumulatedFees[pool.token] += protocolFee;
        }

        emit PrivateWithdrawal(poolId, recipient, pool.denomination, relayer, totalFee);
    }

    /**
     * @notice Relayer withdrawal function
     * @param poolId The privacy pool
     * @param proof ZK-SNARK proof
     * @param root Merkle root
     * @param nullifierHash Nullifier hash
     * @param recipient Withdrawal recipient
     * @param fee Relayer fee
     */
    function relayerWithdraw(
        bytes32 poolId,
        bytes calldata proof,
        bytes32 root,
        bytes32 nullifierHash,
        address payable recipient,
        uint256 fee
    ) external nonReentrant {
        if (!authorizedRelayers[msg.sender]) revert UnauthorizedRelayer();

        PrivacyPool storage pool = privacyPools[poolId];
        if (!pool.isActive) revert PoolNotActive();

        uint256 protocolFee = (pool.denomination * protocolFeeBps) / 10000;
        uint256 totalFee = fee + protocolFee;

        (bool success, ) = pool.tornadoInstance.call{value: pool.token == address(0) ? pool.denomination : 0}(
            abi.encodeWithSignature(
                "withdraw(bytes,bytes32,bytes32,address,address,uint256,uint256)",
                proof, root, nullifierHash, recipient, msg.sender, totalFee, 0
            )
        );
        if (!success) revert TransferFailed();

        if (pool.token != address(0)) {
            accumulatedFees[pool.token] += protocolFee;
        }

        emit PrivateWithdrawal(poolId, recipient, pool.denomination, msg.sender, totalFee);
    }

    // ============================================
    // POOL MANAGEMENT
    // ============================================

    /**
     * @notice Add a new privacy pool
     * @param poolId Unique identifier for the pool
     * @param tornadoInstance Tornado Cash contract address
     * @param denomination Deposit amount
     * @param token Token address (address(0) for ETH)
     */
    function addPrivacyPool(
        bytes32 poolId,
        address tornadoInstance,
        uint256 denomination,
        address token
    ) external onlyOwner {
        require(tornadoInstance != address(0), "Invalid instance");
        require(denomination > 0, "Invalid denomination");
        require(privacyPools[poolId].tornadoInstance == address(0), "Pool exists");

        privacyPools[poolId] = PrivacyPool({
            tornadoInstance: tornadoInstance,
            denomination: denomination,
            token: token,
            isActive: true
        });

        authorizedTornadoInstances[tornadoInstance] = true;
        poolList.push(poolId);

        emit PrivacyPoolAdded(poolId, tornadoInstance, denomination, token);
    }

    /**
     * @notice Deactivate a privacy pool (keeps history, prevents new deposits)
     * @param poolId Pool ID to deactivate
     */
    function deactivatePrivacyPool(bytes32 poolId) external onlyOwner {
        PrivacyPool storage pool = privacyPools[poolId];
        if (pool.tornadoInstance == address(0)) revert PoolNotFound();

        pool.isActive = false;
        emit PrivacyPoolDeactivated(poolId);
    }

    /**
     * @notice Remove a privacy pool entirely
     * @param poolId Pool ID to remove
     */
    function removePrivacyPool(bytes32 poolId) external onlyOwner {
        PrivacyPool storage pool = privacyPools[poolId];
        if (pool.tornadoInstance == address(0)) revert PoolNotFound();

        address tornadoInstance = pool.tornadoInstance;
        delete privacyPools[poolId];
        authorizedTornadoInstances[tornadoInstance] = false;

        // Remove from pool list
        for (uint256 i = 0; i < poolList.length; i++) {
            if (poolList[i] == poolId) {
                poolList[i] = poolList[poolList.length - 1];
                poolList.pop();
                break;
            }
        }

        emit PrivacyPoolRemoved(poolId);
    }

    // ============================================
    // RELAYER MANAGEMENT
    // ============================================

    /**
     * @notice Add authorized relayer
     * @param relayer Relayer address
     */
    function addRelayer(address relayer) external onlyOwner {
        require(relayer != address(0), "Invalid relayer");
        authorizedRelayers[relayer] = true;
        emit RelayerAdded(relayer);
    }

    /**
     * @notice Remove relayer
     * @param relayer Relayer address
     */
    function removeRelayer(address relayer) external onlyOwner {
        authorizedRelayers[relayer] = false;
        emit RelayerRemoved(relayer);
    }

    /**
     * @notice Check if address is authorized relayer
     * @param relayer Address to check
     */
    function isRelayer(address relayer) external view returns (bool) {
        return authorizedRelayers[relayer];
    }

    // ============================================
    // FEE MANAGEMENT
    // ============================================

    /**
     * @notice Update protocol fee
     * @param newFeeBps New fee in basis points
     */
    function setProtocolFee(uint256 newFeeBps) external onlyOwner {
        require(newFeeBps >= MIN_PRIVACY_FEE && newFeeBps <= MAX_PRIVACY_FEE, "Invalid fee");
        protocolFeeBps = newFeeBps;
        emit ProtocolFeeUpdated(newFeeBps);
    }

    /**
     * @notice Withdraw accumulated fees
     * @param token Token address (address(0) for ETH)
     * @param to Recipient address
     * @param amount Amount to withdraw
     */
    function withdrawFees(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner {
        require(to != address(0), "Invalid recipient");

        if (token == address(0)) {
            uint256 balance = address(this).balance;
            if (amount > balance) amount = balance;
            (bool success, ) = to.call{value: amount}("");
            if (!success) revert TransferFailed();
        } else {
            uint256 available = accumulatedFees[token];
            if (amount > available) amount = available;
            accumulatedFees[token] -= amount;
            bool success = IERC20(token).transfer(to, amount);
            if (!success) revert TransferFailed();
        }

        emit FeesWithdrawn(token, to, amount);
    }

    /**
     * @notice Get accumulated fees for a token
     * @param token Token address
     */
    function getAccumulatedFees(address token) external view returns (uint256) {
        return accumulatedFees[token];
    }

    // ============================================
    // VIEW FUNCTIONS
    // ============================================

    /**
     * @notice Get privacy pool details
     * @param poolId Pool ID
     */
    function getPrivacyPool(bytes32 poolId) external view returns (
        address tornadoInstance,
        uint256 denomination,
        address token,
        bool isActive
    ) {
        PrivacyPool memory pool = privacyPools[poolId];
        return (
            pool.tornadoInstance,
            pool.denomination,
            pool.token,
            pool.isActive
        );
    }

    /**
     * @notice Get all pool IDs
     */
    function getAllPoolIds() external view returns (bytes32[] memory) {
        return poolList;
    }

    /**
     * @notice Get active pools
     */
    function getActivePools() external view returns (bytes32[] memory) {
        uint256 activeCount = 0;
        for (uint256 i = 0; i < poolList.length; i++) {
            if (privacyPools[poolList[i]].isActive) {
                activeCount++;
            }
        }

        bytes32[] memory activePools = new bytes32[](activeCount);
        uint256 index = 0;
        for (uint256 i = 0; i < poolList.length; i++) {
            if (privacyPools[poolList[i]].isActive) {
                activePools[index++] = poolList[i];
            }
        }

        return activePools;
    }

    /**
     * @notice Calculate fee for an amount
     * @param amount Deposit/withdrawal amount
     */
    function calculateFee(uint256 amount) external view returns (uint256) {
        return (amount * protocolFeeBps) / 10000;
    }

    // ============================================
    // EMERGENCY FUNCTIONS
    // ============================================

    /**
     * @notice Emergency pause - deactivate all pools
     */
    function emergencyPause() external onlyOwner {
        for (uint256 i = 0; i < poolList.length; i++) {
            privacyPools[poolList[i]].isActive = false;
        }
    }

    /**
     * @notice Resume paused pools
     * @param poolIds Pools to resume
     */
    function resumePools(bytes32[] calldata poolIds) external onlyOwner {
        for (uint256 i = 0; i < poolIds.length; i++) {
            privacyPools[poolIds[i]].isActive = true;
        }
    }

    // ============================================
    // RECEIVE ETHER
    // ============================================

    receive() external payable {}
}
