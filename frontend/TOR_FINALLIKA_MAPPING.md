# Tor ↔ Finallica Mapping Reference

This document provides a complete analogy mapping between Tor's onion router architecture and Finallica's financial privacy network.

---

## Component-Level Mapping

| **Tor Concept** | **Finallica Analogue** | **Key Similarities** | **Key Differences** |
|----------------|------------------------|---------------------|---------------------|
| **Onion Router (OR)** | **Validator-Router (VR)** | • Relay encrypted cells<br/>• 3-hop paths<br/>• Persistent mesh connections | • VRs stake BLF tokens<br/>• VRs earn fees<br/>• Economic incentives |
| **Onion Proxy (OP)** | **Finallica Proxy (FP)** | • Local client software<br/>• Pathfinding engine<br/>• Manages circuits/channels | • FP manages payment streams<br/>• HTLC balance tracking<br/>• Liquidity management |
| **Directory Authority (9)** | **Consensus Notary (8)** | • Trusted infrastructure<br/>• Sign network state<br/>• Distributed trust | • Notaries sign state roots<br/>• HotStuff BFT consensus<br/>• 10-sec finality |
| **Guard Node** | **Guard VR (Entry)** | • First hop, persistent<br/>• Anti-profiling<br/>• High-capacity selection | • 90-day persistence<br/>• Stake-weighted selection<br/>• Entry only (no exit) |
| **Middle Node** | **Middle VR** | • Pure forwarding<br/>• No external identity<br/>• 2nd hop in path | • Identical role<br/>• Same cryptography |
| **Exit Node** | **Settlement Executor (SE)** | • Bridge to external networks<br/>• See plaintext metadata<br/>• Policy-based routing | • SE connects to fiat rails<br/>• Economic settlement<br/>• 2-of-3 redundancy |
| **Circuit** | **Payment Channel** | • 3-hop encrypted path<br/>• Timeout-based expiry<br/>• Tear-down on close | • Channels have HTLC balances<br/>• 6-hour lifetime<br/>• Homomorphic commitments |
| **Stream** | **Payment Stream** | • Multiplexed within circuit/channel<br/>• Identified by stream_id<br/>• Independent lifecycle | • Payments have amounts<br/>• HTLC lock/unlock<br/>• Settlement finality |
| **Cell (514 bytes)** | **Cell (1,024 bytes)** | • Fixed-size network packets<br/>• Command-based routing<br/>• Relay encrypted payload | • 2× size for commitments<br/>• BLS signatures (96 bytes)<br/>• Pedersen commitments |
| **CREATE/CREATED** | **OPEN/OPENED** | • Circuit/channel initiation<br/>• Diffie-Hellman handshake<br/>• Key derivation | • Noise_XX (vs TAP/NTor)<br/>• BLS stake binding<br/>• Faster (230µs vs 1.2ms) |
| **RELAY_DATA** | **PAY** | • Data-bearing cells<br/>• End-to-end encrypted<br/>• Stream multiplexing | • Payment amounts<br/>• Pedersen commitments<br/>• HTLC locking |
| **RELAY_SENDME** | **Channel Window** | • Flow control window<br/>• End-to-end acknowledgments<br/>• Prevent overrun | • Capacity-based ($25K)<br/>• HTLC slot limits<br/>• Liquidity rebalancing |
| **Padding** | **Payment Padding** | • Constant-rate traffic<br/>• Obfuscates timing<br/>• Dummy cells | • Monetary cost ($0.01)<br/>• Dust payments<br/>• 1 cell/sec minimum |
| **Consensus (none)** | **HotStuff BFT** | • N/A (Tor has no state) | • 200ms finality<br/>• State root commitment<br/>• Global ledger |
| **Free to use** | **0.3% avg fee** | • N/A | • Economic incentives<br/>• Stake required<br/>• Fee revenue |

---

## Cryptographic Mapping

| **Tor Cryptography** | **Finallica Analogue** | **Purpose** | **Performance** |
|---------------------|------------------------|------------|-----------------|
| **RSA-1024** | **BLS12-381** | Identity signatures | BLS: 2ms sign, 0.15ms batch verify |
| **NTor (X25519)** | **Noise_XX (X25519)** | Handshake ECDH | Same curve, different pattern |
| **AES-128-CTR** | **ChaCha20-Poly1305** | Symmetric encryption | ChaCha20: 1.2µs vs AES: 2µs |
| **SHA1 (digest)** | **BLAKE2s** | Hash function | BLAKE2s: 25µs vs SHA1: 10µs |
| **SHA256** | **SHA256** (same) | Payment hashes | Identical |
| **Ed25519** | **Ed25519** (same) | Rekey signatures | Identical |
| **N/A** | **Pedersen Commitment** | Amount hiding | Commit: 45µs |
| **N/A** | **Bulletproofs+** | Range proofs | Prove: 780µs, Verify: 5ms (batch: 0.5ms) |

---

## Protocol Mapping

### Handshake Comparison

**Tor TAP (Theorem 1)**:
```
Client → Server: RSA(PK_or, g^x)
Server → Client: g^y, K = SHA1(g^xy)
```

**Tor NTor**:
```
Client → Server: g^x
Server → Client: g^y, g^xy
Client → Server: MAC(K, g^xy)
```

**Finallica Noise_XX**:
```
Client → Server: e (ephemeral X25519)
Server → Client: e, ee, s, es (BLS stake binding)
Client → Server: s, se, psk (client BLS auth)
```

### Cell Command Mapping

| Tor Command | Value | Finallica Command | Value | Purpose |
|-------------|-------|-------------------|-------|---------|
| PADDING | 0x00 | PADDING | 0x00 | Dummy cell |
| CREATE | 0x01 | OPEN | 0x01 | Initiate path |
| CREATED | 0x02 | OPENED | 0x02 | Path acknowledgment |
| RELAY | 0x03 | PAY | 0x02 | Data/payment |
| DESTROY | 0x04 | DESTROY | 0x06 | Teardown |
| RELAY_BEGIN | 0x01 | N/A | - | TCP connect (not used) |
| RELAY_DATA | 0x02 | FORWARD | 0x01 | Forward payment |
| RELAY_END | 0x03 | SETTLE | 0x03 | Settlement |
| RELAY_EXTEND | 0x06 | EXTEND | 0x04 | Extend path |
| N/A | - | REKEY | 0x05 | Rotate keys |

---

## Performance Comparison

| Metric | Tor | Finallica | Ratio |
|--------|-----|-----------|-------|
| **Network Size** | 7,000 relays | 12,000 VRs | 1.7× |
| **Circuit/Channel Build** | 200-500ms | 127-340ms | 0.63× |
| **Cell Processing** | 2ms/hop | 0.8µs/hop | 0.0004× |
| **Total Throughput** | 350 Gbps | 500 Gbps | 1.4× |
| **Anonymity Set** | ~3,000 | ~1,200 | 0.4× |
| **Finality** | None (best-effort) | 200ms | N/A |
| **Cost to Use** | Free | 0.3% fee | N/A |
| **Staking Required** | No (volunteer) | Yes ($2.25M min) | N/A |
| **Settlement Time** | Instant (TCP) | 1-3 days (SWIFT) | N/A |

---

## Economic Model Comparison

| Aspect | Tor | Finallica |
|--------|-----|-----------|
| **Funding** | Donations, grants | Transaction fees |
| **Operator Incentives** | Altruism | Fee revenue |
| **Entry Cost** | $0 | $2.25M (500K BLF) |
| **Slashable** | No | Yes (up to 100%) |
| **Revenue per VR** | $0 | $2,697/epoch (avg) |
| **APY** | N/A | ~12% (guard) |
| **Inflation** | None | 4% annually |

---

## Anonymity Model Comparison

| Property | Tor | Finallica |
|----------|-----|-----------|
| **Adversary Model** | Global passive | Global passive + economic |
| **Anonymity Definition** | Probable innocence | Untraceable indistinguishability |
| |AS| Size** | ~3,000 | ~1,200 |
| **Timing Resistance** | Padding (weak) | Padding + quantization |
| **Amount Hiding** | N/A | Pedersen commitments |
| **Exit Compromise** | See plaintext | See plaintext + can censor |
| **Guard Discovery** | 1/7000 per guard | 0.31% per guard (stake-weighted) |

---

## Routing Algorithm Comparison

### Tor Path Selection

```
weight = bandwidth_fraction

where:
  bandwidth_fraction = node_bandwidth / total_bandwidth

Guard selection:
  - Persistent for 2-3 months
  - Bandwidth-weighted random
  - Exclude same /16 subnet
```

### Finallica Path Selection

```
weight = stake^0.7 × uptime_factor / fee_bps^2

where:
  stake_fraction = node_stake / shard_stake
  uptime_factor = min(uptime_days / 30, 1.0)
  fee_bps = configured_routing_fee

Guard selection:
  - Persistent for 90 days
  - Stake-weighted random
  - Exclude same family (operator)
  - Higher-stake guards preferred
```

---

## Summary Table: Side-by-Side

```
┌──────────────────────┬─────────────────────┬─────────────────────┐
│ Tor                  │ Finallica           │ Difference          │
├──────────────────────┼─────────────────────┼─────────────────────┤
│ 7,000 relays         │ 12,000 VRs          │ 1.7× larger         │
│ Volunteer-run        │ Stake-required      │ Economic incentives │
│ RSA-1024/Ed25519     │ BLS12-381/Ed25519   │ Aggregate sigs      │
│ AES-128-CTR          │ ChaCha20-Poly1305   │ Different cipher    │
│ 514-byte cells       │ 1,024-byte cells    │ 2× size             │
│ 3 hops               │ 3 hops              │ Same                │
│ No state             │ HTLC balances       │ Financial state     │
│ No finality          │ 200ms finality      │ BFT consensus       │
│ Free                 │ 0.3% fee            │ Paid service        │
│ Instant              │ 1-3 days (SWIFT)    │ Settlement delay    │
│ ~3,000 anonymity set │ ~1,200 anonymity set│ Smaller set         │
│ Directory (9)        │ Notaries (8)        │ BFT vs voting       │
└──────────────────────┴─────────────────────┴─────────────────────┘
```

---

## Key Insight

Finallica adapts Tor's layered encryption and path diversity architecture to financial value transfer, but adds:

1. **Economic security**: Stake slashing reduces Sybil attacks
2. **Settlement finality**: BFT consensus provides irreversible transactions
3. **Amount privacy**: Pedersen commitments hide payment values
4. **Liquidity management**: Channel windows and rebalancing
5. **Regulatory compliance**: 127 shards for jurisdictional partitioning

The tradeoff: **smaller anonymity set (1,200 vs 3,000)** due to stake-weighted routing and payment timing correlation.

---

*Back to [README.md](./README.md)*
