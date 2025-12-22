// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title FinallicaGovernanceToken
 * @notice BLF token used for staking and governance in Finallica
 * @dev This is the governance token that allows holders to propose and vote on changes
 */
contract FinallicaGovernanceToken is Ownable {
    string public constant name = "Finallica Governance Token";
    string public constant symbol = "BLF";
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    /// @notice Staked balance for each user
    mapping(address => uint256) public stakedBalance;

    /// @notice Delegate address for voting
    mapping(address => address) public delegate;

    /// @notice Total staked tokens
    uint256 public totalStaked;

    /// @notice Minimum stake for VR (Validator-Router)
    uint256 public constant MIN_STAKE_VR = 500_000 * 10**18; // 500K BLF

    /// @notice Minimum stake for Settlement Executor
    uint256 public constant MIN_STAKE_SE = 2_000_000 * 10**18; // 2M BLF

    /// @notice Unstaking period in seconds
    uint256 public constant UNBONDING_PERIOD = 30 days;

    /// @notice Unstaking requests
    mapping(address => uint256) public unstakeRequestTime;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event UnstakeRequested(address indexed user, uint256 amount, uint256 availableAt);
    event DelegateChanged(address indexed from, address indexed to, address delegate);

    constructor(uint256 initialSupply) {
        totalSupply = initialSupply;
        balanceOf[msg.sender] = initialSupply;
        emit Transfer(address(0), msg.sender, initialSupply);
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 currentAllowance = allowance[from][msg.sender];
        require(currentAllowance >= value, "Insufficient allowance");
        allowance[from][msg.sender] = currentAllowance - value;
        _transfer(from, to, value);
        return true;
    }

    function stake(uint256 amount) external {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        require(amount >= MIN_STAKE_VR, "Below minimum stake");

        balanceOf[msg.sender] -= amount;
        stakedBalance[msg.sender] += amount;
        totalStaked += amount;

        emit Staked(msg.sender, amount);
    }

    function requestUnstake(uint256 amount) external {
        require(stakedBalance[msg.sender] >= amount, "Insufficient staked balance");
        stakedBalance[msg.sender] -= amount;
        unstakeRequestTime[msg.sender] = block.timestamp;
        uint256 availableAt = block.timestamp + UNBONDING_PERIOD;

        emit UnstakeRequested(msg.sender, amount, availableAt);
    }

    function unstake() external {
        require(unstakeRequestTime[msg.sender] > 0, "No unstake request");
        require(block.timestamp >= unstakeRequestTime[msg.sender], "Still unbonding");
        require(block.timestamp >= unstakeRequestTime[msg.sender] + UNBONDING_PERIOD, "Unbonding period not met");

        uint256 amount = stakedBalance[msg.sender];
        require(amount > 0, "Nothing to unstake");

        stakedBalance[msg.sender] = 0;
        unstakeRequestTime[msg.sender] = 0;
        balanceOf[msg.sender] += amount;
        totalStaked -= amount;

        emit Unstaked(msg.sender, amount);
    }

    function setDelegate(address to) external {
        delegate[msg.sender] = to;
        emit DelegateChanged(msg.sender, to, to);
    }

    function getVotingPower(address account) external view returns (uint256) {
        address delegatedTo = delegate[account];
        if (delegatedTo == address(0)) {
            return stakedBalance[account];
        }
        return stakedBalance[delegatedTo];
    }

    function _transfer(address from, address to, uint256 value) internal {
        require(balanceOf[from] >= value, "Insufficient balance");
        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }
}

/**
 * @title FinallicaProposals
 * @notice Manages proposals for changes to Finallica documentation
 * @dev Uses BLS aggregated signatures for efficient verification
 */
contract FinallicaProposals is Ownable, ReentrancyGuard {
    FinallicaGovernanceToken public token;

    uint256 public nextProposalId;
    uint256 public constant PROPOSAL_STAKE = 1000 * 10**18; // 1000 BLF
    uint256 public constant VOTING_PERIOD = 7 days;
    uint256 public constant QUORUM_PCT = 67; // 67%

    struct Proposal {
        uint256 id;
        address proposer;
        string title;
        string document; // Document name (e.g., "README.md")
        string diff;    // Git diff format
        string rationale;
        ProposalType proposalType;
        ProposalStatus status;
        uint256 createdAt;
        uint256 deadline;
        uint256 votesFor;
        uint256 votesAgainst;
        uint256 votesAbstain;
        uint256 totalStake;
        bool executed;
    }

    enum ProposalType {
        DOCUMENT_EDIT,
        NEW_SECTION,
        PROTOCOL_CHANGE,
        PARAMETER_UPDATE
    }

    enum ProposalStatus {
        PENDING,
        APPROVED,
        REJECTED,
        EXECUTED
    }

    mapping(uint256 => Proposal) public proposals;

    /// @notice Vote record per proposal per voter
    mapping(uint256 => mapping(address => Vote)) public votes;

    struct Vote {
        bool hasVoted;
        bool support; // true = for, false = against
        uint256 stake;
        uint8 weight; // 1-100, percentage of stake to commit
    }

    event ProposalCreated(
        uint256 indexed id,
        address indexed proposer,
        string title,
        ProposalType proposalType
    );

    event VoteCast(
        uint256 indexed proposalId,
        address indexed voter,
        bool support,
        uint256 stake
    );

    event ProposalExecuted(uint256 indexed proposalId);

    modifier onlyProposer() {
        require(token.stakedBalance(msg.sender) >= PROPOSAL_STAKE, "Not enough staked");
        _;
    }

    constructor(address tokenAddress) {
        token = FinallicaGovernanceToken(tokenAddress);
    }

    /**
     * @notice Create a new proposal
     * @param title Title of the proposal
     * @param document Document name to modify
     * @param diff Git diff format changes
     * @param rationale Explanation for the change
     * @param proposalType Type of proposal
     */
    function createProposal(
        string calldata title,
        string calldata document,
        string calldata diff,
        string calldata rationale,
        ProposalType proposalType
    ) external onlyProposer returns (uint256) {
        uint256 proposalId = nextProposalId++;

        proposals[proposalId] = Proposal({
            id: proposalId,
            proposer: msg.sender,
            title: title,
            document: document,
            diff: diff,
            rationale: rationale,
            proposalType: proposalType,
            status: ProposalStatus.PENDING,
            createdAt: block.timestamp,
            deadline: block.timestamp + VOTING_PERIOD,
            votesFor: 0,
            votesAgainst: 0,
            votesAbstain: 0,
            totalStake: 0,
            executed: false
        });

        emit ProposalCreated(proposalId, msg.sender, title, proposalType);
        return proposalId;
    }

    /**
     * @notice Cast a vote on a proposal
     * @param proposalId ID of the proposal
     * @param support True to vote for, false to vote against
     * @param weight Percentage of stake to commit (1-100)
     */
    function castVote(
        uint256 proposalId,
        bool support,
        uint8 weight
    ) external {
        Proposal storage proposal = proposals[proposalId];
        require(proposal.id != 0, "Proposal does not exist");
        require(proposal.status == ProposalStatus.PENDING, "Proposal not active");
        require(block.timestamp <= proposal.deadline, "Voting ended");
        require(!votes[proposalId][msg.sender].hasVoted, "Already voted");
        require(weight > 0 && weight <= 100, "Invalid weight");

        uint256 voterStake = token.getVotingPower(msg.sender);
        require(voterStake > 0, "No voting power");

        uint256 voteWeight = (voterStake * weight) / 100;

        votes[proposalId][msg.sender] = Vote({
            hasVoted: true,
            support: support,
            stake: voterStake,
            weight: weight
        });

        if (support) {
            proposal.votesFor += voteWeight;
        } else {
            proposal.votesAgainst += voteWeight;
        }

        proposal.totalStake += voteWeight;

        emit VoteCast(proposalId, msg.sender, support, voteWeight);

        // Check if quorum reached and decision made
        _checkProposalOutcome(proposalId);
    }

    /**
     * @notice Cast batch votes (for BLS aggregated signatures)
     * @param proposalId ID of the proposal
     * @param voters Addresses of voters
     * @param support Whether each voter supports
     * @param sigs BLS aggregated signature
     */
    function castBatchVotes(
        uint256 proposalId,
        address[] calldata voters,
        bool[] calldata support,
        bytes calldata sigs
    ) external {
        require(voters.length == support.length, "Array length mismatch");
        // In production, verify BLS signature here

        for (uint256 i = 0; i < voters.length; i++) {
            Proposal storage proposal = proposals[proposalId];
            if (proposal.status != ProposalStatus.PENDING) continue;

            address voter = voters[i];
            if (votes[proposalId][voter].hasVoted) continue;

            uint256 voterStake = token.getVotingPower(voter);
            if (voterStake == 0) continue;

            uint256 voteWeight = voterStake; // 100% weight for batch votes

            votes[proposalId][voter] = Vote({
                hasVoted: true,
                support: support[i],
                stake: voterStake,
                weight: 100
            });

            if (support[i]) {
                proposal.votesFor += voteWeight;
            } else {
                proposal.votesAgainst += voteWeight;
            }

            proposal.totalStake += voteWeight;

            emit VoteCast(proposalId, voter, support[i], voteWeight);
        }

        _checkProposalOutcome(proposalId);
    }

    /**
     * @notice Execute an approved proposal
     * @param proposalId ID of the proposal to execute
     */
    function executeProposal(uint256 proposalId) external nonReentrant {
        Proposal storage proposal = proposals[proposalId];
        require(proposal.id != 0, "Proposal does not exist");
        require(proposal.status == ProposalStatus.APPROVED, "Proposal not approved");
        require(!proposal.executed, "Already executed");
        require(block.timestamp > proposal.deadline, "Voting still active");

        proposal.status = ProposalStatus.EXECUTED;
        proposal.executed = true;

        emit ProposalExecuted(proposalId);
    }

    function _checkProposalOutcome(uint256 proposalId) internal {
        Proposal storage proposal = proposals[proposalId];

        // Calculate quorum
        uint256 quorum = (token.totalStaked() * QUORUM_PCT) / 100;

        if (proposal.totalStake >= quorum) {
            if (proposal.votesFor > proposal.votesAgainst) {
                proposal.status = ProposalStatus.APPROVED;
            } else if (proposal.votesAgainst > proposal.votesFor) {
                proposal.status = ProposalStatus.REJECTED;
            }
        }
    }

    /**
     * @notice Get proposal details
     */
    function getProposal(uint256 proposalId) external view returns (
        uint256 id,
        address proposer,
        string memory title,
        string memory document,
        string memory diff,
        string memory rationale,
        ProposalType proposalType,
        ProposalStatus status,
        uint256 createdAt,
        uint256 deadline,
        uint256 votesFor,
        uint256 votesAgainst,
        uint256 votesAbstain,
        uint256 totalStake,
        bool executed
    ) {
        Proposal storage p = proposals[proposalId];
        return (
            p.id,
            p.proposer,
            p.title,
            p.document,
            p.diff,
            p.rationale,
            p.proposalType,
            p.status,
            p.createdAt,
            p.deadline,
            p.votesFor,
            p.votesAgainst,
            p.votesAbstain,
            p.totalStake,
            p.executed
        );
    }

    /**
     * @notice Check if an address has voted on a proposal
     */
    function hasVoted(uint256 proposalId, address voter) external view returns (bool) {
        return votes[proposalId][voter].hasVoted;
    }
}

/**
 * @title FinallicaConsensus
 * @notice HotStuff-style BFT consensus for Finallica state roots
 * @dev Implements 3-phase commit with 8 notary nodes
 */
contract FinallicaConsensus is Ownable {
    /// @notice State root of the Finallica documentation system
    bytes32 public stateRoot;

    /// @notice Current block/epoch number
    uint256 public blockNumber;
    uint256 public epoch;

    /// @notice Notary nodes (8 authorities)
    mapping(address => bool) public isNotary;
    address[] public notaries;

    /// @notice Quorum threshold (5 of 8)
    uint256 public constant QUORUM_THRESHOLD = 5;

    /// @notice State root history
    mapping(uint256 => bytes32) public stateRootHistory;

    /// @notice Signatures for each state root
    mapping(uint256 => mapping(address => bytes)) public stateRootSigs;

    /// @notice View number for leader rotation
    uint256 public viewNumber;

    /// @notice Current leader
    address public leader;

    struct Phase {
        uint256 viewNumber;
        PhaseType phaseType;
        uint256 startTime;
        bytes32 blockHash;
        bytes32 prepareQC;
        bytes32 precommitQC;
        bytes32 commitQC;
    }

    enum PhaseType {
        PREPARE,
        PRE_COMMIT,
        COMMIT,
        DECIDE
    }

    Phase public currentPhase;

    /// @notice Events
    event StateRootProposed(uint256 indexed view, address indexed leader, bytes32 stateRoot);
    event PhaseTransition(uint256 indexed view, PhaseType from, PhaseType to);
    event StateRootFinalized(uint256 indexed blockNumber, bytes32 stateRoot, bytes32 aggregatedSig);

    modifier onlyNotary() {
        require(isNotary[msg.sender], "Not a notary");
        _;
    }

    modifier onlyLeader() {
        require(msg.sender == leader, "Not the leader");
        _;
    }

    constructor() {
        // Initialize 8 demo notary addresses
        for (uint256 i = 0; i < 8; i++) {
            address notaryAddress = address(uint160(0x1000 + i));
            notaries.push(notaryAddress);
            isNotary[notaryAddress] = true;
        }

        leader = notaries[0];
        blockNumber = 18492;
        epoch = 1;

        currentPhase = Phase({
            viewNumber: 0,
            phaseType: PhaseType.PREPARE,
            startTime: block.timestamp,
            blockHash: bytes32(0),
            prepareQC: bytes32(0),
            precommitQC: bytes32(0),
            commitQC: bytes32(0)
        });
    }

    /**
     * @notice Propose a new state root (HotStuff PREPARE phase)
     * @param stateRoot The new state root hash
     */
    function proposeStateRoot(bytes32 stateRoot) external onlyLeader {
        require(currentPhase.phaseType == PhaseType.DECIDE ||
                currentPhase.phaseType == PhaseType.PREPARE,
                "Invalid phase transition");

        // Move to PREPARE phase
        currentPhase = Phase({
            viewNumber: viewNumber,
            phaseType: PhaseType.PREPARE,
            startTime: block.timestamp,
            blockHash: keccak256(abi.encodePacked(blockNumber, stateRoot)),
            prepareQC: bytes32(0),
            precommitQC: bytes32(0),
            commitQC: bytes32(0)
        });

        emit StateRootProposed(viewNumber, msg.sender, stateRoot);
        emit PhaseTransition(viewNumber, PhaseType.DECIDE, PhaseType.PREPARE);
    }

    /**
     * @notice Vote for a state root (collect signatures)
     * @param stateRoot The state root being voted on
     * @param signature The notary's BLS signature
     */
    function voteStateRoot(bytes32 stateRoot, bytes memory signature) external onlyNotary {
        stateRootSigs[blockNumber][msg.sender] = signature;

        // Count signatures
        uint256 sigCount = 0;
        for (uint256 i = 0; i < notaries.length; i++) {
            if (stateRootSigs[blockNumber][notaries[i]] != bytes32(0)) {
                sigCount++;
            }
        }

        // If we have quorum, finalize
        if (sigCount >= QUORUM_THRESHOLD) {
            _finalizeStateRoot(stateRoot);
        }
    }

    /**
     * @notice Finalize a state root (HotStuff DECIDE phase)
     * @param stateRoot The finalized state root
     */
    function _finalizeStateRoot(bytes32 stateRoot) internal {
        // Store state root
        stateRootHistory[blockNumber] = stateRoot;
        stateRoot = stateRoot;

        // Advance block
        blockNumber++;

        // Rotate leader every 8 blocks
        if (blockNumber % 8 == 0) {
            viewNumber++;
            leader = notaries[viewNumber % notaries.length];
        }

        // New epoch every 100 blocks
        if (blockNumber % 100 == 0) {
            epoch++;
        }

        // Move to DECIDE phase
        currentPhase.phaseType = PhaseType.DECIDE;

        emit StateRootFinalized(blockNumber, stateRoot, bytes32(0));
    }

    /**
     * @notice Get the current state root
     */
    function getCurrentStateRoot() external view returns (bytes32) {
        return stateRoot;
    }

    /**
     * @notice Verify a Merkle proof against the state root
     * @param proof The Merkle proof
     * @param root The expected root
     */
    function verifyMerkleProof(
        bytes32[] memory proof,
        bytes32 root,
        bytes32 leaf,
        uint256 index
    ) external pure returns (bool) {
        bytes32 computedHash = leaf;

        for (uint256 i = 0; i < proof.length; i++) {
            if (index % 2 == 0) {
                computedHash = keccak256(abi.encodePacked(computedHash, proof[i]));
            } else {
                computedHash = keccak256(abi.encodePacked(proof[i], computedHash));
            }
            index /= 2;
        }

        return computedHash == root;
    }

    /**
     * @notice Add a notary
     */
    function addNotary(address notaryAddress) external onlyOwner {
        require(!isNotary[notaryAddress], "Already a notary");
        notaries.push(notaryAddress);
        isNotary[notaryAddress] = true;
    }

    /**
     * @notice Remove a notary
     */
    function removeNotary(address notaryAddress) external onlyOwner {
        require(isNotary[notaryAddress], "Not a notary");
        isNotary[notaryAddress] = false;

        // Remove from array
        for (uint256 i = 0; i < notaries.length; i++) {
            if (notaries[i] == notaryAddress) {
                notaries[i] = notaries[notaries.length - 1];
                notaries.pop();
                break;
            }
        }
    }

    /**
     * @notice Get all notaries
     */
    function getNotaries() external view returns (address[] memory) {
        return notaries;
    }

    /**
     * @notice Calculate voting weight using stake^0.7
     * @param stake The staker's stake amount
     */
    function calculateVotingWeight(uint256 stake) external pure returns (uint256) {
        // weight = stake^0.7
        // Using approximation: (stake^70 / 10^70) / 10^17
        // For simplicity, returning linear scaling here
        // In production, use a proper power function library
        return stake / 10; // Simplified demo
    }

    /**
     * @notice Get consensus status
     */
    function getConsensusStatus() external view returns (
        uint256 _blockNumber,
        uint256 _epoch,
        bytes32 _stateRoot,
        address _leader,
        uint256 _viewNumber,
        PhaseType _phaseType,
        uint256 _notaryCount,
        uint256 _quorumThreshold
    ) {
        return (
            blockNumber,
            epoch,
            stateRoot,
            leader,
            viewNumber,
            currentPhase.phaseType,
            notaries.length,
            QUORUM_THRESHOLD
        );
    }
}

/**
 * @title FinallicaDocumentRegistry
 * @notice Stores document hashes on-chain for verification
 */
contract FinallicaDocumentRegistry is Ownable {
    /// @notice Mapping of document name to content hash
    mapping(string => bytes32) public documentHashes;

    /// @notice Mapping of document name to block number of last update
    mapping(string => uint256) public documentVersions;

    /// @notice Document history
    struct DocumentVersion {
        bytes32 contentHash;
        address updater;
        uint256 blockNumber;
        uint256 timestamp;
        string commitHash;
    }

    mapping(string => DocumentVersion[]) public documentHistory;

    event DocumentUpdated(
        string indexed documentName,
        bytes32 contentHash,
        address indexed updater,
        uint256 blockNumber
    );

    /**
     * @notice Register a document update
     * @param documentName Name of the document
     * @param contentHash SHA256 hash of the content
     * @param commitHash Git commit hash
     */
    function updateDocument(
        string calldata documentName,
        bytes32 contentHash,
        string calldata commitHash
    ) external {
        documentHashes[documentName] = contentHash;
        documentVersions[documentName] = block.number;

        documentHistory[documentName].push(DocumentVersion({
            contentHash: contentHash,
            updater: msg.sender,
            blockNumber: block.number,
            timestamp: block.timestamp,
            commitHash: commitHash
        });

        emit DocumentUpdated(documentName, contentHash, msg.sender, block.number);
    }

    /**
     * @notice Verify a document's content hash
     * @param documentName Name of the document
     * @param contentHash Hash to verify
     */
    function verifyDocument(string calldata documentName, bytes32 contentHash)
        external view returns (bool)
    {
        return documentHashes[documentName] == contentHash;
    }

    /**
     * @notice Get document history
     */
    function getDocumentHistory(string calldata documentName)
        external view returns (DocumentVersion[] memory)
    {
        return documentHistory[documentName];
    }

    /**
     * @notice Get the latest content hash for a document
     */
    function getLatestHash(string calldata documentName)
        external view returns (bytes32)
    {
        return documentHashes[documentName];
    }
}

/**
 * @title FinallicaStaking
 * @notice Manages staking and slashing for Validator-Routers
 */
contract FinallicaStaking is Ownable, ReentrancyGuard {
    FinallicaGovernanceToken public token;

    struct Validator {
        address owner;
        uint256 stake;
        uint256 bondedAt;
        bool isActive;
        bool isSlashed;
        uint256 slashCount;
        ValidatorType vType;
    }

    enum ValidatorType {
        GUARD,
        MIDDLE,
        SETTLEMENT_EXECUTOR
    }

    mapping(address => Validator) public validators;

    address[] public validatorList;

    /// @notice Minimum stake amounts
    uint256 public constant MIN_STAKE_GUARD = 15_700_000 * 10**18; // 15.7M BLF
    uint256 public constant MIN_STAKE_MIDDLE = 2_000_000 * 10**18; // 2M BLF
    uint256 public constant MIN_STAKE_SE = 12_300_000 * 10**18; // 12.3M BLF

    /// @notice Slashing conditions
    uint256 public constant SLASH_DOUBLE_SIGN = 10000; // 100%
    uint256 public constant SLASH_CENSORSHIP = 1000;    // 10%
    uint256 public constant SLASH_DOWNTIME = 100;       // 1%

    event ValidatorRegistered(address indexed validator, ValidatorType vType, uint256 stake);
    event ValidatorUnregistered(address indexed validator);
    event ValidatorSlashed(address indexed validator, uint256 amount, string reason);

    constructor(address tokenAddress) {
        token = FinallicaGovernanceToken(tokenAddress);
    }

    /**
     * @notice Register as a Validator-Router
     * @param vType Type of validator
     * @param stakeAmount Amount to stake
     */
    function registerValidator(ValidatorType vType, uint256 stakeAmount)
        external nonReentrant
    {
        require(validators[msg.sender].stake == 0, "Already registered");

        uint256 minStake;
        if (vType == ValidatorType.GUARD) {
            minStake = MIN_STAKE_GUARD;
        } else if (vType == ValidatorType.MIDDLE) {
            minStake = MIN_STAKE_MIDDLE;
        } else {
            minStake = MIN_STAKE_SE;
        }

        require(stakeAmount >= minStake, "Insufficient stake");

        // Transfer tokens to contract
        require(token.transferFrom(msg.sender, address(this), stakeAmount),
            "Transfer failed");

        validators[msg.sender] = Validator({
            owner: msg.sender,
            stake: stakeAmount,
            bondedAt: block.timestamp,
            isActive: true,
            isSlashed: false,
            slashCount: 0,
            vType: vType
        };

        validatorList.push(msg.sender);

        emit ValidatorRegistered(msg.sender, vType, stakeAmount);
    }

    /**
     * @notice Unregister as validator
     */
    function unregisterValidator() external nonReentrant {
        Validator storage validator = validators[msg.sender];
        require(validator.isActive, "Not active");

        // Must wait unbonding period
        require(block.timestamp >= validator.bondedAt + 30 days,
            "Still bonded");

        // Return stake
        require(token.transfer(msg.sender, validator.stake), "Transfer failed");

        validator.isActive = false;
        // Remove from list (would need to implement proper removal)

        emit ValidatorUnregistered(msg.sender);
    }

    /**
     * @notice Slash a validator for misbehavior
     * @param validatorAddress Address of the validator to slash
     * @param reason Reason for slashing
     * @param percentage Percentage to slash (basis points)
     */
    function slashValidator(
        address validatorAddress,
        string calldata reason,
        uint256 percentage
    ) external onlyOwner {
        require(validators[validatorAddress].isActive, "Not active");
        require(percentage <= 10000, "Invalid percentage");

        Validator storage validator = validators[validatorAddress];
        uint256 slashAmount = (validator.stake * percentage) / 10000;

        require(token.transfer(owner(), slashAmount), "Transfer failed");
        validator.stake -= slashAmount;
        validator.slashCount++;
        validator.isSlashed = true;

        emit ValidatorSlashed(validatorAddress, slashAmount, reason);
    }

    /**
     * @notice Get validator info
     */
    function getValidator(address validatorAddress) external view returns (
        address owner,
        uint256 stake,
        uint256 bondedAt,
        bool isActive,
        bool isSlashed,
        uint256 slashCount,
        ValidatorType vType
    ) {
        Validator memory v = validators[validatorAddress];
        return (
            v.owner,
            v.stake,
            v.bondedAt,
            v.isActive,
            v.isSlashed,
            v.slashCount,
            v.vType
        );
    }

    /**
     * @notice Get all validators
     */
    function getAllValidators() external view returns (address[] memory) {
        return validatorList;
    }

    /**
     * @notice Get total staked across all validators
     */
    function getTotalStaked() external view returns (uint256) {
        uint256 total = 0;
        for (uint256 i = 0; i < validatorList.length; i++) {
            total += validators[validatorList[i]].stake;
        }
        return total;
    }
}
