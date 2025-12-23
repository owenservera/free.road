// Seed script for initial repositories and collections

const db = require('./database');
const crypto = require('crypto');

const INITIAL_REPOSITORIES = [
    // Privacy Networks
    {
        name: 'torproject/tor',
        url: 'https://github.com/torproject/tor',
        branch: 'main',
        description: 'Core Tor implementation providing the foundation for onion services and privacy networks',
        tags: ['privacy', 'anonymous', 'onion-routing', 'foundational'],
        sourceType: 'github'
    },
    {
        name: 'torproject/privacy-docs',
        url: 'https://github.com/torproject/privacy-docs',
        branch: 'main',
        description: 'Official Tor privacy documentation with onion-service guides',
        tags: ['privacy', 'documentation', 'guides'],
        sourceType: 'github'
    },
    {
        name: 'i2p/i2p.i2p',
        url: 'https://github.com/i2p/i2p.i2p',
        branch: 'main',
        description: 'I2P anonymous network with emphasis on censorship resistance',
        tags: ['privacy', 'anonymous', 'p2p', 'censorship-resistant'],
        sourceType: 'github'
    },
    // Cryptography
    {
        name: 'ethereum/consensus-specs',
        url: 'https://github.com/ethereum/consensus-specs',
        branch: 'master',
        description: 'Official Ethereum consensus specs with BLS signature implementations',
        tags: ['cryptography', 'bls', 'consensus', 'ethereum'],
        sourceType: 'github'
    },
    {
        name: 'matter-labs/awesome-zero-knowledge-proofs',
        url: 'https://github.com/matter-labs/awesome-zero-knowledge-proofs',
        branch: 'master',
        description: 'Comprehensive ZKP knowledge base with library comparisons',
        tags: ['cryptography', 'zk-snark', 'zk-stark', 'zero-knowledge'],
        sourceType: 'github'
    },
    {
        name: 'ethereum/awesome-privacy-sig',
        url: 'https://github.com/ethereum/awesome-privacy-sig',
        branch: 'master',
        description: 'Research resources for privacy-preserving signatures and protocols',
        tags: ['cryptography', 'privacy', 'signatures', 'research'],
        sourceType: 'github'
    },
    // P2P Networking
    {
        name: 'libp2p/specs',
        url: 'https://github.com/libp2p/specs',
        branch: 'master',
        description: 'Official libp2p P2P networking specifications',
        tags: ['p2p', 'networking', 'protocol-specs', 'libp2p'],
        sourceType: 'github'
    },
    {
        name: 'ipfs/ipfs',
        url: 'https://github.com/ipfs/ipfs',
        branch: 'master',
        description: 'IPFS implementation - practical P2P file system',
        tags: ['p2p', 'ipfs', 'storage', 'distributed'],
        sourceType: 'github'
    },
    // Consensus
    {
        name: 'hot-stuff/libhotstuff',
        url: 'https://github.com/hot-stuff/libhotstuff',
        branch: 'master',
        description: 'Production-ready HotStuff BFT consensus engine',
        tags: ['consensus', 'bft', 'hotstuff', 'leader-based'],
        sourceType: 'github'
    },
    {
        name: 'cometbft/cometbft',
        url: 'https://github.com/cometbft/cometbft',
        branch: 'main',
        description: 'CometBFT (formerly Tendermint Core) BFT consensus implementation',
        tags: ['consensus', 'bft', 'tendermint', 'production'],
        sourceType: 'github'
    },
    // Payment Channels
    {
        name: 'lightningnetwork/lnd',
        url: 'https://github.com/lightningnetwork/lnd',
        branch: 'master',
        description: 'Lightning Network reference implementation',
        tags: ['lightning', 'payment-channels', 'bitcoin', 'layer2'],
        sourceType: 'github'
    },
    {
        name: 'raiden-network/raiden',
        url: 'https://github.com/raiden-network/raiden',
        branch: 'master',
        description: 'Ethereum state channels implementation for scaling',
        tags: ['payment-channels', 'ethereum', 'state-channels', 'scaling'],
        sourceType: 'github'
    }
];

const INITIAL_COLLECTIONS = [
    {
        id: 'col_privacy_foundations',
        name: 'Privacy Foundations',
        slug: 'privacy-foundations',
        description: 'Core privacy-preserving technologies and protocols including Tor, I2P, and onion routing.',
        isFeatured: true,
        tags: ['privacy', 'anonymous', 'foundational'],
        sortOrder: 1
    },
    {
        id: 'col_cryptography',
        name: 'Cryptography Libraries',
        slug: 'cryptography-libraries',
        description: 'Cryptographic primitives including BLS signatures, zero-knowledge proofs, and privacy-preserving signatures.',
        isFeatured: true,
        tags: ['cryptography', 'zk-snark', 'bls', 'privacy'],
        sortOrder: 2
    },
    {
        id: 'col_p2p_networking',
        name: 'P2P Networking',
        slug: 'p2p-networking',
        description: 'Peer-to-peer network protocols and implementations including libp2p and IPFS.',
        isFeatured: true,
        tags: ['p2p', 'networking', 'distributed', 'protocols'],
        sortOrder: 3
    },
    {
        id: 'col_consensus',
        name: 'Blockchain Consensus',
        slug: 'blockchain-consensus',
        description: 'Consensus algorithm implementations including HotStuff BFT, Tendermint/CometBFT, and Ethereum specifications.',
        isFeatured: true,
        tags: ['consensus', 'bft', 'hotstuff', 'tendermint'],
        sortOrder: 4
    },
    {
        id: 'col_payment_channels',
        name: 'Payment Channels',
        slug: 'payment-channels',
        description: 'Layer 2 scaling solutions including Lightning Network and state channels for both Bitcoin and Ethereum.',
        isFeatured: true,
        tags: ['lightning', 'payment-channels', 'layer2', 'scaling'],
        sortOrder: 5
    }
];

async function generateId(prefix) {
    return (prefix || 'id') + '_' + crypto.randomBytes(16).toString('hex');
}

async function seed() {
    console.log('Starting database seed...');

    await db.initialize();

    // Add repositories
    const repoMap = {};
    for (const repoData of INITIAL_REPOSITORIES) {
        const repo = {
            id: await generateId('repo'),
            ...repoData
        };
        await db.createRepository(repo);
        repoMap[repo.name] = repo.id;
        console.log(`  Added repository: ${repo.name}`);
    }

    // Add collections with repository mappings
    const collectionRepos = {
        'col_privacy_foundations': ['torproject/tor', 'torproject/privacy-docs', 'i2p/i2p.i2p'],
        'col_cryptography': ['ethereum/consensus-specs', 'matter-labs/awesome-zero-knowledge-proofs', 'ethereum/awesome-privacy-sig'],
        'col_p2p_networking': ['libp2p/specs', 'ipfs/ipfs'],
        'col_consensus': ['hot-stuff/libhotstuff', 'cometbft/cometbft'],
        'col_payment_channels': ['lightningnetwork/lnd', 'raiden-network/raiden']
    };

    for (const colData of INITIAL_COLLECTIONS) {
        const collection = {
            ...colData,
            repositoryIds: (collectionRepos[colData.id] || []).map(name => repoMap[name]).filter(id => id)
        };
        await db.createCollection(collection);
        console.log(`  Added collection: ${collection.name} (${collection.repositoryIds.length} repos)`);
    }

    console.log('Seed complete!');
    console.log(`  Repositories: ${INITIAL_REPOSITORIES.length}`);
    console.log(`  Collections: ${INITIAL_COLLECTIONS.length}`);

    await db.close();
}

seed().catch(console.error);
