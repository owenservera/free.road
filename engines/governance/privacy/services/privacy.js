/**
 * Privacy Service for Tornado Cash Integration
 * Handles ZK proof generation, note management, and Tornado Cash interactions
 *
 * @module services/privacy-service
 * @description Provides optional privacy layer for Finallica on-chain transactions
 */

const { ethers } = require('ethers');
const crypto = require('crypto');

// ABI snippets for Tornado Cash contracts
const TORNADO_ABI = [
    'function deposit(bytes32) external payable',
    'function withdraw(bytes,bytes32,bytes32,address,address,uint256,uint256) external payable',
    'event Deposit(bytes32 indexed commitment, uint32 leafIndex, uint256 timestamp)'
];

const ERC20_ABI = [
    'function approve(address,uint256) external returns (bool)',
    'function allowance(address,address) external view returns (uint256)',
    'function balanceOf(address) external view returns (uint256)'
];

const PRIVACY_ROUTER_ABI = [
    'function privateDepositETH(bytes32,bytes32) external payable',
    'function privateDepositERC20(bytes32,bytes32) external',
    'function privateWithdraw(bytes,bytes32,bytes32,bytes32,address,address,uint256,uint256) external',
    'function addPrivacyPool(bytes32,address,uint256,address) external',
    'function getPrivacyPool(bytes32) external view returns (address,uint256,address,bool)',
    'function getActivePools() external view returns (bytes32[])'
];

/**
 * Privacy Service Class
 */
class PrivacyService {
    /**
     * @param {Object} config - Configuration object
     * @param {string} config.rpcUrl - Ethereum RPC URL
     * @param {string} config.privacyRouterAddress - FinallicaPrivacyRouter contract address
     * @param {Object} config.tornadoInstances - Tornado Cash instance addresses
     * @param {string} config.relayerUrl - Optional relayer URL
     */
    constructor(config) {
        this.provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
        this.privacyRouterAddress = config.privacyRouterAddress;
        this.relayerUrl = config.relayerUrl;

        // Initialize contracts
        if (this.privacyRouterAddress) {
            this.privacyRouter = new ethers.Contract(
                this.privacyRouterAddress,
                PRIVACY_ROUTER_ABI,
                this.provider
            );
        }

        // Tornado Cash instance addresses (configurable per network)
        this.tornadoInstances = config.tornadoInstances || {
            // Mainnet (placeholder addresses - use actual deployed addresses)
            ETH_0_1: process.env.TORNADO_ETH_0_1 || '0x...',
            ETH_1: process.env.TORNADO_ETH_1 || '0x...',
            ETH_10: process.env.TORNADO_ETH_10 || '0x...',
            ETH_100: process.env.TORNADO_ETH_100 || '0x...',
            USDC_100: process.env.TORNADO_USDC_100 || '0x...',
            // BLF token pools (deploy separately)
            BLF_100: process.env.TORNADO_BLF_100 || '0x...',
            BLF_1000: process.env.TORNADO_BLF_1000 || '0x...'
        };

        // Token addresses
        this.tokens = {
            BLF: process.env.BLF_TOKEN_ADDRESS,
            USDC: process.env.USDC_ADDRESS || '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            USDT: process.env.USDT_ADDRESS || '0xdAC17F958D2ee523a2206206994597C13D831ec7'
        };
    }

    /**
     * Generate a private note for deposit
     * @param {string} token - Token symbol ('ETH', 'BLF', 'USDC')
     * @param {string|number} amount - Amount to deposit
     * @returns {Promise<Object>} Note object containing secrets and commitment
     */
    async generateNote(token, amount) {
        // Generate random nullifier and secret (31 bytes each)
        const nullifier = crypto.randomBytes(31);
        const secret = crypto.randomBytes(31);

        // In production, use actual Pedersen hash from circomlibjs
        // For now, simulate with Keccak256
        const nullifierHash = ethers.utils.solidityKeccak256(
            ['bytes32', 'bytes32'],
            [nullifier, ethers.utils.zeros(32)]
        );

        const commitment = ethers.utils.solidityKeccak256(
            ['bytes32', 'bytes32'],
            [nullifier, secret]
        );

        // Create pool ID
        const poolId = ethers.utils.solidityKeccak256(
            ['string', 'uint256'],
            [token, amount]
        );

        // Create note string (user-friendly format)
        const note = this.formatNote(token, amount, commitment);

        return {
            nullifier: '0x' + nullifier.toString('hex'),
            secret: '0x' + secret.toString('hex'),
            commitment,
            nullifierHash,
            note,
            token,
            amount: amount.toString(),
            poolId,
            createdAt: Date.now()
        };
    }

    /**
     * Deposit to Tornado Cash for privacy
     * @param {Object} note - Note object from generateNote()
     * @param {string|ethers.Wallet} signer - User's wallet or private key
     * @param {Object} options - Deposit options
     * @returns {Promise<Object>} Transaction result
     */
    async deposit(note, signer, options = {}) {
        let wallet;

        if (typeof signer === 'string') {
            // Private key provided
            wallet = new ethers.Wallet(signer, this.provider);
        } else if (signer instanceof ethers.Wallet) {
            wallet = signer;
        } else if (signer.connect) {
            // JsonRpcSigner or similar
            wallet = signer;
        } else {
            throw new Error('Invalid signer');
        }

        const token = note.token.toUpperCase();
        const amount = note.amount;

        // Check if we should use the privacy router or direct Tornado
        const useRouter = options.useRouter !== false && this.privacyRouter;

        if (useRouter) {
            return await this.depositViaRouter(note, wallet, options);
        }

        return await this.depositDirect(note, wallet, options);
    }

    /**
     * Deposit via FinallicaPrivacyRouter contract
     * @private
     */
    async depositViaRouter(note, wallet, options) {
        const router = new ethers.Contract(
            this.privacyRouterAddress,
            PRIVACY_ROUTER_ABI,
            wallet
        );

        let tx;
        const token = note.token.toUpperCase();

        if (token === 'ETH') {
            tx = await router.privateDepositETH(
                note.poolId,
                note.commitment,
                { value: ethers.utils.parseEther(note.amount) }
            );
        } else {
            // ERC20 deposit - ensure approval first
            const tokenAddress = this.getTokenAddress(token);
            const erc20 = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);

            // Check allowance
            const allowance = await erc20.allowance(await wallet.getAddress(), this.privacyRouterAddress);
            const depositAmount = ethers.utils.parseUnits(note.amount, this.getTokenDecimals(token));

            if (allowance.lt(depositAmount)) {
                // Approve
                const approveTx = await erc20.approve(this.privacyRouterAddress, depositAmount);
                await approveTx.wait();
            }

            tx = await router.privateDepositERC20(
                note.poolId,
                note.commitment
            );
        }

        const receipt = await tx.wait();

        return {
            success: true,
            txHash: receipt.transactionHash,
            blockNumber: receipt.blockNumber,
            note: note.note,
            gasUsed: receipt.gasUsed.toString()
        };
    }

    /**
     * Deposit directly to Tornado Cash instance
     * @private
     */
    async depositDirect(note, wallet, options) {
        const tornadoAddress = this.getTornadoInstance(note.token, note.amount);
        const tornado = new ethers.Contract(tornadoAddress, TORNADO_ABI, wallet);

        let tx;
        const token = note.token.toUpperCase();

        if (token === 'ETH') {
            tx = await tornado.deposit(note.commitment, {
                value: ethers.utils.parseEther(note.amount)
            });
        } else {
            // ERC20 - approve first
            const tokenAddress = this.getTokenAddress(token);
            const erc20 = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
            const depositAmount = ethers.utils.parseUnits(note.amount, this.getTokenDecimals(token));

            const allowance = await erc20.allowance(await wallet.getAddress(), tornadoAddress);
            if (allowance.lt(depositAmount)) {
                const approveTx = await erc20.approve(tornadoAddress, depositAmount);
                await approveTx.wait();
            }

            tx = await tornado.deposit(note.commitment);
        }

        const receipt = await tx.wait();

        return {
            success: true,
            txHash: receipt.transactionHash,
            blockNumber: receipt.blockNumber,
            note: note.note,
            gasUsed: receipt.gasUsed.toString()
        };
    }

    /**
     * Withdraw from Tornado Cash
     * @param {string} noteString - The saved note string
     * @param {string} recipient - Withdrawal address
     * @param {Object} options - Withdrawal options
     * @param {string} options.relayerUrl - Override default relayer URL
     * @param {ethers.Wallet} options.wallet - Wallet for signing
     * @returns {Promise<Object>} Withdrawal result
     */
    async withdraw(noteString, recipient, options = {}) {
        // Parse note
        const note = this.parseNote(noteString);

        // Compute Merkle proof
        const merkleProof = await this.computeMerkleProof(note.commitment, options.tornadoInstance);

        // Generate ZK proof
        const zkProof = await this.generateWithdrawProof(note, merkleProof, recipient);

        const relayerUrl = options.relayerUrl || this.relayerUrl;

        if (relayerUrl) {
            return await this.withdrawViaRelayer(note, zkProof, merkleProof, recipient, relayerUrl);
        } else {
            return await this.withdrawDirect(note, zkProof, merkleProof, recipient, options);
        }
    }

    /**
     * Withdraw via relayer service
     * @private
     */
    async withdrawViaRelayer(note, zkProof, merkleProof, recipient, relayerUrl) {
        const response = await fetch(`${relayerUrl}/withdraw`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                proof: zkProof,
                root: merkleProof.root,
                nullifierHash: note.nullifierHash,
                recipient,
                fee: 0,
                refund: 0
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Relayer error: ${error}`);
        }

        const result = await response.json();
        return {
            success: true,
            ...result,
            method: 'relayer'
        };
    }

    /**
     * Direct withdrawal (less private as it shows the caller's address)
     * @private
     */
    async withdrawDirect(note, zkProof, merkleProof, recipient, options) {
        if (!options.wallet) {
            throw new Error('Wallet required for direct withdrawal');
        }

        const tornadoAddress = options.tornadoInstance || this.getTornadoInstance(note.token, note.amount);
        const tornado = new ethers.Contract(tornadoAddress, TORNADO_ABI, options.wallet);

        const tx = await tornado.withdraw(
            zkProof,
            merkleProof.root,
            note.nullifierHash,
            recipient,
            options.wallet.address, // relayer = caller for direct withdrawals
            0, // fee
            0  // refund
        );

        const receipt = await tx.wait();

        return {
            success: true,
            txHash: receipt.transactionHash,
            blockNumber: receipt.blockNumber,
            method: 'direct'
        };
    }

    /**
     * Generate ZK-SNARK proof for withdrawal
     * @private
     * @param {Object} note - Note object
     * @param {Object} merkleProof - Merkle proof
     * @param {string} recipient - Recipient address
     * @returns {Promise<string>} ZK proof
     */
    async generateWithdrawProof(note, merkleProof, recipient) {
        // In production, this would use snarkjs or similar:
        //
        // const snarkjs = require('snarkjs');
        // const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        //     {
        //         root: merkleProof.root,
        //         nullifierHash: note.nullifierHash,
        //         recipient: recipient.toLowerCase(),
        //         relayer: address(0),
        //         fee: 0,
        //         refund: 0,
        //         secret: note.secret,
        //         nullifier: note.nullifier,
        //         pathElements: merkleProof.pathElements,
        //         pathIndices: merkleProof.pathIndices
        //     },
        //     'circuit.wasm',
        //     'circuit_final.zkey'
        // );
        // return this.formatProof(proof);

        // For now, return a placeholder proof
        // This would need actual ZK circuit compilation in production
        const proofInputs = ethers.utils.AbiCoder.defaultAbiCoder().encode(
            ['bytes32', 'bytes32', 'address', 'address', 'uint256', 'uint256'],
            [
                merkleProof.root,
                note.nullifierHash,
                recipient,
                ethers.constants.AddressZero,
                0,
                0
            ]
        );

        return '0x' + crypto.randomBytes(128).toString('hex') + proofInputs.slice(2);
    }

    /**
     * Compute Merkle proof for a commitment
     * @private
     * @param {bytes32} commitment - The commitment to find in the tree
     * @param {string} tornadoInstance - Tornado Cash instance address
     * @returns {Promise<Object>} Merkle proof
     */
    async computeMerkleProof(commitment, tornadoInstance) {
        // In production, fetch all Deposit events and build Merkle tree
        // using the incremental Merkle tree from tornado-core
        //
        // const tornado = new ethers.Contract(tornadoInstance, TORNADO_ABI, this.provider);
        // const depositEvents = await tornado.queryFilter('Deposit');
        // const tree = new IncrementalMerkleTree(20);
        // for (const event of depositEvents) {
        //     tree.insert(event.args.commitment);
        // }
        // const proof = tree.createProof(commitment);

        // Simplified placeholder for development
        return {
            root: ethers.utils.formatBytes32String('merkle_root_placeholder'),
            pathElements: [],
            pathIndices: []
        };
    }

    /**
     * Format note string
     * @private
     */
    formatNote(token, amount, commitment) {
        const commitmentShort = commitment.slice(0, 10);
        return `tornado-${token}-${amount}-${commitmentShort}-${commitment}`;
    }

    /**
     * Parse note string
     * @param {string} noteString - Note string to parse
     * @returns {Object} Parsed note data
     */
    parseNote(noteString) {
        const parts = noteString.split('-');
        if (parts.length < 5 || parts[0] !== 'tornado') {
            throw new Error('Invalid note format');
        }

        return {
            token: parts[1],
            amount: parts[2],
            commitment: parts[4],
            fullNote: noteString
        };
    }

    /**
     * Get Tornado Cash instance address for token/amount pair
     * @private
     */
    getTornadoInstance(token, amount) {
        const key = `${token}_${amount}`;
        return this.tornadoInstances[key] || this.tornadoInstances.ETH_0_1;
    }

    /**
     * Get token address
     * @private
     */
    getTokenAddress(token) {
        const address = this.tokens[token];
        if (!address) {
            throw new Error(`Unknown token: ${token}`);
        }
        return address;
    }

    /**
     * Get token decimals
     * @private
     */
    getTokenDecimals(token) {
        const decimals = {
            ETH: 18,
            BLF: 18,
            USDC: 6,
            USDT: 6
        };
        return decimals[token] || 18;
    }

    /**
     * Get available privacy pools
     * @returns {Promise<Array>} Array of available pools
     */
    async getAvailablePools() {
        if (!this.privacyRouter) {
            // Return default pools configuration
            return Object.entries(this.tornadoInstances)
                .filter(([key, address]) => address !== '0x...')
                .map(([key, address]) => {
                    const [token, amount] = key.split('_');
                    return { token, amount, address };
                });
        }

        try {
            const poolIds = await this.privacyRouter.getActivePools();
            const pools = [];

            for (const poolId of poolIds) {
                const [tornadoInstance, denomination, token, isActive] =
                    await this.privacyRouter.getPrivacyPool(poolId);

                if (isActive) {
                    pools.push({
                        poolId,
                        tornadoInstance,
                        denomination: denomination.toString(),
                        token,
                        isActive
                    });
                }
            }

            return pools;
        } catch (error) {
            console.error('Error fetching pools:', error);
            return [];
        }
    }

    /**
     * Validate a note string
     * @param {string} noteString - Note to validate
     * @returns {boolean} True if valid
     */
    validateNote(noteString) {
        try {
            const parsed = this.parseNote(noteString);
            return (
                parsed.commitment.length === 66 &&
                parsed.commitment.startsWith('0x')
            );
        } catch {
            return false;
        }
    }

    /**
     * Calculate estimated fee for a transaction
     * @param {string} token - Token symbol
     * @param {string|number} amount - Amount
     * @returns {Object} Fee breakdown
     */
    calculateFees(token, amount) {
        // Base protocol fee (0.25%)
        const protocolFeeBps = 25;
        const amountWei = ethers.utils.parseUnits(amount.toString(), this.getTokenDecimals(token));
        const protocolFee = amountWei.mul(protocolFeeBps).div(10000);

        // Relayer fee (typical ~0.1% or gas cost equivalent)
        const relayerFeeBps = 10;
        const relayerFee = amountWei.mul(relayerFeeBps).div(10000);

        return {
            protocolFee: ethers.utils.formatUnits(protocolFee, this.getTokenDecimals(token)),
            relayerFee: ethers.utils.formatUnits(relayerFee, this.getTokenDecimals(token)),
            totalFee: ethers.utils.formatUnits(protocolFee.add(relayerFee), this.getTokenDecimals(token)),
            totalFeeBps: protocolFeeBps + relayerFeeBps
        };
    }

    /**
     * Get status of a withdrawal transaction
     * @param {string} txHash - Transaction hash
     * @returns {Promise<Object>} Transaction status
     */
    async getWithdrawalStatus(txHash) {
        try {
            const receipt = await this.provider.getTransactionReceipt(txHash);

            if (!receipt) {
                return { status: 'pending', confirmations: 0 };
            }

            const currentBlock = await this.provider.getBlockNumber();
            return {
                status: receipt.status === 1 ? 'success' : 'failed',
                confirmations: currentBlock - receipt.blockNumber,
                blockNumber: receipt.blockNumber,
                txHash: receipt.transactionHash
            };
        } catch (error) {
            return { status: 'unknown', error: error.message };
        }
    }
}

module.exports = PrivacyService;
