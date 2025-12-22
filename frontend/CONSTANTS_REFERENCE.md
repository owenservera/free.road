# Finallica Constants Reference

This document contains all hardcoded constants, limits, and configuration values used throughout the Finallica system.

---

## Cell Protocol Constants

```c
// Cell sizes
#define CELL_SIZE_FINALLICA      1024     // 1 KB per cell
#define PAYLOAD_SIZE_FINALLICA   1008     // Max payload size
#define RELAY_HEADER_SIZE        11       // Payment relay header
#define MAX_STREAM_DATA_SIZE     498      // Max data per PAY cell

// Command types
#define CMD_PADDING              0x00
#define CMD_OPEN                 0x01
#define CMD_PAY                  0x02
#define CMD_SETTLE               0x03
#define CMD_EXTEND               0x04
#define CMD_REKEY                0x05
#define CMD_DESTROY              0x06

// Channel IDs
#define CHANNEL_ID_MIN           1
#define CHANNEL_ID_MAX_INTRA     0x7FFFFFFF  // 2^31 - 1
#define CHANNEL_ID_MAX_INTER     0xFFFFFFFF
#define CHANNEL_ID_ZERO          0  // Reserved

// Stream IDs
#define STREAM_ID_MIN            0x0001
#define STREAM_ID_MAX            0xFFFE
#define STREAM_ID_CIRCUIT        0x0000  // Reserved
#define STREAM_ID_FOR_DIR        0x0001  // Reserved for directory fetch
#define STREAM_ID_MAX_VAL        0xFFFF
```

---

## Channel Management Constants

```c
// Channel lifecycle
#define MAX_ROUTE_LEN            8        // Maximum hops
#define DEFAULT_ROUTE_LEN        3        // Standard path length
#define MIN_CPUS_FOR_EXTEND      1        // Min CPUs for extend
#define CHANNEL_LIFETIME_MAX     21600    // 6 hours (in seconds)
#define CHANNEL_TIMEOUT_INIT     30       // Initial timeout (seconds)

// Guard selection
#define GUARD_LIFETIME           7776000  // 90 days (in seconds)
#define MAX_GUARD_FAILURES       20       // Max failures before rotation
#define GUARD_USAGE_FAILURES     4        // Failures before circuit close

// Channel limits per VR
#define MAX_CHANNELS_PER_PEER    5000
#define CHANNEL_MIN_CAPACITY     50000000 // $500 in microcents
#define CHANNEL_REKEY_INTERVAL   3600     // 1 hour (seconds)
```

---

## HTLC Constants

```c
// HTLC limits
#define HTLC_MIN_VALUE_MICROCENT 1       // $0.00001
#define HTLC_MAX_VALUE_MICROCENT 100000000000  // $1M
#define HTLC_MIN_TIMEOUT         40       // 10 blocks (~5 minutes)
#define HTLC_MAX_TIMEOUT         86400    // 1 day (in seconds)
#define MAX_HTLCS_PER_CHANNEL    483      // BOLT-03 limit

// HTLC timing (in blocks)
#define HTLC_TIMEOUT_MIN_BLOCKS  10
#define HTLC_TIMEOUT_MAX_BLOCKS  1440     // ~1 day
#define HTLC_DEFAULT_TIMEOUT     100      // Default expiry

// HTLC state
#define HTLC_STATE_OFFERED       0
#define HTLC_STATE_LOCKED        1
#define HTLC_STATE_SETTLED       2
#define HTLC_STATE_REFUNDED      3
#define HTLC_STATE_FAILED        4
```

---

## Cryptographic Constants

```c
// BLS12-381
#define BLS12_381_G1_COMPRESSED_SIZE   48   // Pubkey size
#define BLS12_381_G2_COMPRESSED_SIZE   96   // Signature size
#define BLS12_381_FP_SIZE             48   // Field element size
#define BLS_AGGREGATION_BATCH         64   // Optimal batch size

// X25519 / Noise
#define X25519_PUBLIC_KEY_SIZE        32
#define X25519_PRIVATE_KEY_SIZE       32
#define X25519_SHARED_SECRET_SIZE     32
#define NOISE_HANDSHAKE_HASH_SIZE     32

// ChaCha20-Poly1305
#define CHACHA20_KEY_SIZE             32
#define CHACHA20_NONCE_SIZE           12
#define POLY1305_TAG_SIZE             16

// Pedersen Commitment
#define PEDERSEN_COMMITMENT_SIZE      33   // Compressed
#define PEDERSEN_BLINDING_SIZE        32   // Scalar size
#define PEDERSEN_VALUE_BITS           64   // Range: [0, 2^64)

// SHA256 / BLAKE2s
#define SHA256_DIGEST_SIZE            32
#define BLAKE2S_DIGEST_SIZE           32
#define BLAKE2S_KEY_SIZE              32

// Ed25519 (rekey signatures)
#define ED25519_PUBLIC_KEY_SIZE       32
#define ED25519_PRIVATE_KEY_SIZE      64
#define ED25519_SIGNATURE_SIZE        64
```

---

## Network Protocol Constants

```c
// Ports
#define DATAPLANE_PORT           31337    // UDP (DPDK)
#define CONTROLPLANE_PORT        31338    // TCP (TLS)
#define ABUSE_REPORT_PORT        31339    // TCP

// Shard configuration
#define SHARD_COUNT              127      // Total shards
#define SHARD_ID_MIN             0
#define SHARD_ID_MAX             126
#define SHARD_ID_GLOBAL          127      // Reserved

// VR counts
#define VR_PER_SHARD_MIN         1000
#define VR_PER_SHARD_AVG         2400
#define VR_PER_SHARD_MAX         5000
#define BRIDGE_VR_PERCENT        5        // Top 5% become bridges

// Consensus
#define NOTARY_COUNT             8
#define NOTARY_SIG_THRESHOLD     5        // 5 of 8 BFT
#define CONSENSUS_INTERVAL_SEC   10       // State root every 10 sec
#define HOTSTUFF_VIEW_TIMEOUT    50000    // 50ms initial (µs)
#define HOTSTUFF_QC_THRESHOLD    0.67     // 67% voting power
```

---

## Performance Tuning Constants

```c
// DPDK configuration
#define DPDK_MEMPOOL_SIZE        2097152  // 2M packets
#define DPDK_CACHE_SIZE          512      // Per-core cache
#define DPDK_RING_SIZE           4096     // RX/TX ring
#define DPDK_BURST_SIZE          32       // Packets per burst

// Cell queuing
#define CELL_QUEUE_HIGHWATER     512000   // 1000 cells × 512B
#define CELL_QUEUE_LOWWATER      51200    // 100 cells × 512B
#define MAX_REFILLED_CELLS       10       // Per tick

// Scheduling
#define SCHEDULING_INTERVAL_MSEC 10       // KIST interval
#define KIST_MAX_SCHED_BURST     32       // Max cells per schedule
#define KIST_SOCK_OUTQ_MIN       514      // Min socket queue

// CPU affinity
#define CPU_PIN_CONTROL          true
#define CPU_PIN_DATAPLANE        false
```

---

## Fee Structure Constants

```c
// Basis points (1 bp = 0.01%)
#define FEE_BPS_GUARD_MIN        2
#define FEE_BPS_GUARD_MAX        10
#define FEE_BPS_MIDDLE_MIN       3
#define FEE_BPS_MIDDLE_MAX       15
#define FEE_BPS_EXIT_MIN         10
#define FEE_BPS_EXIT_MAX         100

// Settlement rail fees
#define FEE_BPS_SWIFT            25       // 0.25%
#define FEE_BPS_ACH              10       // 0.10%
#define FEE_BPS_SEPA             15       // 0.15%
#define FEE_BPS_BTC              50       // 0.50%
#define FEE_BPS_LN               5        // 0.05%

// Liquidity fees
#define LIQUIDITY_FEE_BASE_BPS   2        // 0.02%
#define LIQUIDITY_UTIL_HIGH      0.85     // 85% threshold
#define LIQUIDITY_UTIL_EXP       4        // Exponential factor

// Padding cost (per user)
#define PADDING_RATE_CELLS_PER_SEC 1     // 1 cell/sec
#define DUST_PAYMENT_AMOUNT      1        // $0.01 (microcents)
```

---

## Staking & Economics Constants

```c
// Token supply
#define TOTAL_SUPPLY_BLF         21000000 // 21M BLF total
#define STAKED_SUPPLY_TARGET     0.878    // 87.8% target
#define INFLATION_RATE_ANNUAL    0.04     // 4% per year

// Minimum stake requirements
#define MIN_STAKE_VR             500000   // 500K BLF (~$2.25M)
#define MIN_STAKE_SE             2000000  // 2M BLF (~$9M)
#define MIN_STAKE_NOTARY         10000000 // 10M BLF (~$45M)

// Unbonding
#define UNBONDING_PERIOD_SEC     2592000  // 30 days

// Slashing penalties (basis points)
#define SLASH_DOUBLE_SIGN        10000    // 100%
#define SLASH_CENSORSHIP         1000     // 10%
#define SLASH_INVALID_SETTLEMENT 500      // 5%
#define SLASH_DOWNTIME           100      // 1% per day

// Liquidity mining
#define LIQUIDITY_APY_MIN        800      // 8% APY minimum
#define LIQUIDITY_TARGET_UTIL    0.60     // 60% utilization optimal
#define CHANNEL_REBALANCE_THRESHOLD_HIGH 0.85  // 85%
#define CHANNEL_REBALANCE_THRESHOLD_LOW  0.15  // 15%
```

---

## Memory Management Constants

```c
// Per-channel memory (40,736 bytes total)
#define CHANNEL_STATE_SIZE       224      // struct channel_t
#define CRYPTO_KEYS_SIZE         1536     // 6 cipher states
#define HTLC_TABLE_SIZE          30912    // 483 entries × 64B
#define QUEUE_BUFFERS_SIZE       4096     // Input + output rings
#define REPLAY_PROTECTION_SIZE   8192     // Bloom filter
#define PATH_STATE_SIZE          640      // Guard + middle info

// Memory limits
#define MAX_MEM_IN_QUEUES_MB     1024     // 1 GB default
#define OOM_KILL_THRESHOLD       0.90     // 90% memory usage

// Channel capacity by memory
#define CHANNELS_PER_4GB         98000    // Theoretical
#define CHANNELS_PER_8GB         150000   // Practical
#define CHANNELS_PER_16GB        250000   // High-end
#define CHANNELS_PER_64GB        1000000  // Max
```

---

## Flow Control Constants

```c
// SENDME windows
#define PACKAGE_WINDOW_DEFAULT   1000     // Cells
#define DELIVER_WINDOW_DEFAULT   1000     // Cells
#define SENDME_CELL_THRESHOLD   100      // Send SENDME every 100 cells

// Token bucket rate limits
#define RATE_LIMIT_NORMAL        1000     // cells/sec
#define RATE_LIMIT_HIGH_PRIORITY 5000    // cells/sec
#define RATE_LIMIT_SETTLEMENT    10000    // cells/sec
#define RATE_LIMIT_PADDING       1        // cell/sec

// Burst sizes
#define BURST_NORMAL             100      // cells
#define BURST_HIGH_PRIORITY      500      // cells
#define BURST_SETTLEMENT         1000     // cells
#define BURST_PADDING            10       // cells

// Congestion control
#define CWND_MIN                 100
#define CWND_MAX                 10000
#define CWND_INITIAL             1000
#define SSTHRESH_INITIAL         10000
```

---

## Timing Constants

```c
// Adaptive timeout parameters
#define TIMEOUT_INITIAL_MS       200      // Initial circuit timeout
#define TIMEOUT_MIN_MS           50       // Minimum timeout
#define TIMEOUT_MAX_MS           5000     // Maximum timeout

// Timeout calculation weights
#define TIMEOUT_EWMA_ALPHA       0.8      // Exponential moving average
#define_TIMEOUT_SAMPLE_WEIGHT    0.2

// Keepalive
#define KEEPALIVE_INTERVAL_SEC   60       // PING every 60 sec
#define KEEPALIVE_TIMEOUT_SEC    300      // 5 minutes without response

// Circuit build timing
#define CIRCUIT_BUILD_TIMEOUT_MIN 50     // ms
#define CIRCUIT_BUILD_TIMEOUT_MAX 10000   // ms

// Payment expiry
#define PAYMENT_EXPIRY_MIN_SEC   60       // 1 minute
#define PAYMENT_EXPIRY_MAX_SEC   86400    // 1 day
#define PAYMENT_EXPIRY_DEFAULT   3600     // 1 hour
```

---

## Directory & Consensus Constants

```c
// Consensus document
#define CONSENSUS_PERIOD_SEC     3600     // Vote every hour
#define CONSENSUS_VALID_AFTER_SEC 7200     // Valid 2 hours
#define CONSENSUS_FRESH_UNTIL_SEC 10800   // Fresh for 3 hours
#define CONSENSUS_VALID_UNTIL_SEC 18000   // Valid for 5 hours

// Voting
#define VOTE_DELAY_SEC           300      // 5 minutes
#define CONSENSUS_METHOD_MIN     27       // Minimum supported method
#define CONSENSUS_METHOD_MAX     30       // Maximum supported method

// Descriptor sizes
#define MICRODESC_DIGEST_SIZE    32       // SHA256
#define ROUTER_DESC_MAX_SIZE     8192     // 8 KB max
```

---

## Padding Constants

```c
// Link padding
#define PADDING_SCHEDULE_SINE_WAVE 1      // Sine wave pattern
#define PADDING_CYCLE_SECONDS    86400    // 24-hour cycle
#define PADDING_MIN_RATE_BPS     1250000  // 1.25 MB/s min
#define PADDING_MAX_RATE_BPS     10000000 // 10 MB/s max

// Cell padding
#define PADDING_CELL_BURST_LAMBDA 5.0    // Poisson λ
#define PADDING_CELL_MIN_SIZE    0        // Can be zero
#define PADDING_CELL_MAX_SIZE    255      // Bytes

// Payment padding (dust)
#define DUST_PAYMENTS_PER_DAY    1000     // Target dust payments
#define DUST_PAYMENT_AMOUNT      1        // $0.01 (microcents)
```

---

## Path Selection Weights

```c
// Weight calculation
#define WEIGHT_STAKE_EXPONENT   0.7      // stake^0.7
#define WEIGHT_FEE_EXPONENT     2.0      // fee^2 (penalty)
#define WEIGHT_UPTIME_DAYS     30       // Uptime normalization

// Bandwidth weights
#define BW_WEIGHT_FLOOR         5120     // 5 KB/s minimum
#define BW_WEIGHT_CAP           10485760 // 10 MB/s cap

// Guard fraction
#define GUARD_FRACTION_MIN      0.20     // 20% of nodes
#define GUARD_FRACTION_MAX      0.40     // 40% of nodes
```

---

## Debug & Logging Constants

```c
// Log levels
#define LOG_DEBUG               0
#define LOG_INFO                1
#define LOG_NOTICE              2
#define LOG_WARN                3
#define LOG_ERROR               4

// Logging domains
#define LD_GENERAL              "GENERAL"
#define LD_NET                  "NET"
#define LD_CONFIG               "CONFIG"
#define LD_CRYPTO               "CRYPTO"
#define LD_HTLC                 "HTLC"
#define LD_CONSENSUS            "CONSENSUS"

// Tracing
#define TRACE                   1        // Enable trace logging
#define DEBUG_CELL              0        // Log all cells
```

---

## Compatibility Versions

```c
// Protocol versions
#define PROTO_VERSION_MIN       4
#define PROTO_VERSION_MAX       4
#define PROTO_VERSION_CURRENT   4

// Consensus methods
#define CONSENSUS_METHOD_MIN    27
#define CONSENSUS_METHOD_MAX    30
#define CONSENSUS_METHOD_CURRENT 28

// Supported link protocols
#define LINK_PROTO_MIN          2
#define LINK_PROTO_MAX          3        // 1=TLS 1.2, 2=TLS 1.3, 3=Noise_XX
```

---

## Security Thresholds

```c
// Path bias detection
#define PATH_BIAS_PERCENTAGE_WARN   25    // Warning at 25%
#define PATH_BIAS_PERCENTAGE_ABORT  10    // Abort at 10%
#define PATH_BISECT_THRESHOLD       5     // Extends b/w this

// DoS limits
#define DOS_CONN_PER_ADDRESS     4        // Max conns per IP
#define DOS_CONCURRENT_CONN_BONUS 32     // Allow bonus for good behavior
#define DOS_MAX_CIRCUITS_PER_SEC 10     // Max circuits per second

// Abuse detection
#define ABUSE_PORT_SCAN_THRESHOLD 3      // Flag after 3 port scans
#define ABUSE_DMCA_PER_DAY        1       // DMCA notice limit
#define ABUSE_SSH_BRUTE_PER_HOUR  12     // SSH brute force limit
```

---

## Unit Conversion Macros

```c
// Time conversions
#define MS_TO_US(ms)             ((ms) * 1000)
#define SEC_TO_MS(sec)           ((sec) * 1000)
#define SEC_TO_US(sec)           ((sec) * 1000000)
#define MIN_TO_SEC(min)          ((min) * 60)
#define HOURS_TO_SEC(hr)         ((hr) * 3600)
#define DAYS_TO_SEC(day)         ((day) * 86400)

// Microcent conversions (1 microcent = $0.00001)
#define USD_TO_MICROCENTS(usd)   ((uint64_t)((usd) * 100000))
#define MICROCENTS_TO_USD(uc)    (((uc) / 100.0) / 1000.0)
#define CENTS_TO_MICROCENTS(c)   ((c) * 10000)

// Basis points (1 bp = 0.01%)
#define BPS_TO_RATIO(bps)        ((bps) / 10000.0)
#define RATIO_TO_BPS(ratio)      ((int)((ratio) * 10000))

// Token conversions (1 BLF = $4.50)
#define BLF_TO_USD(blf)          ((blf) * 4.50)
#define USD_TO_BLF(usd)          ((usd) / 4.50)
```

---

## Summary Table: Critical Constants

| Category | Constant | Value | Notes |
|----------|----------|-------|-------|
| **Cell** | CELL_SIZE | 1,024 bytes | Fixed packet size |
| **Cell** | MAX_HTLCS_PER_CHANNEL | 483 | BOLT-03 limit |
| **Channel** | CHANNEL_LIFETIME_MAX | 21,600 sec | 6 hours |
| **Channel** | CHANNEL_MIN_CAPACITY | $500 | In microcents |
| **Guard** | GUARD_LIFETIME | 7,776,000 sec | 90 days |
| **Fees** | FEE_BPS_EXIT_MIN | 10 bp | 0.10% |
| **Fees** | FEE_BPS_SWIFT | 25 bp | 0.25% |
| **Stake** | MIN_STAKE_VR | 500K BLF | ~$2.25M |
| **Stake** | MIN_STAKE_SE | 2M BLF | ~$9M |
| **Crypto** | BLS12_381_G1_SIZE | 48 bytes | Pubkey |
| **Crypto** | BLS12_381_G2_SIZE | 96 bytes | Signature |
| **Network** | SHARD_COUNT | 127 | Total shards |
| **Network** | NOTARY_COUNT | 8 | Consensus authorities |
| **Timing** | CONSENSUS_INTERVAL | 10 sec | State root period |
| **Window** | PACKAGE_WINDOW_DEFAULT | 1,000 cells | Flow control |

---

*Back to [README.md](./README.md)*
