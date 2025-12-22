# Finallica Architecture Overview

This document describes the macro network architecture and end-to-end payment flow of the Finallica global financial privacy network.

---

## Section 1: Macro Network Architecture

### 1.1 Global Topology

The Finallica network operates as a **trust-minimized settlement overlay** consisting of:

- **127 jurisdictional shards** for regulatory compliance and latency optimization
- **~12,000 Validator-Routers (VRs)** distributed globally
- **8 Consensus Notaries** providing BFT state root signatures
- **15,240 cross-shard bridge links** connecting shards

### 1.2 Consensus Notaries (8 Authorities)

Eight geo-distributed notaries maintain the global state root:

| Notary | Location | BLS Pubkey | Stake |
|--------|----------|------------|-------|
| Notary1 | Switzerland | 0x1a2b... | 50M BLF |
| Notary2 | Singapore | 0x3c4d... | 48M BLF |
| Notary3 | Iceland | 0x5e6f... | 52M BLF |
| Notary4 | Canada | 0x7a8b... | 45M BLF |
| Notary5 | New Zealand | 0x9c0d... | 51M BLF |
| Notary6 | Germany | 0xae1f... | 47M BLF |
| Notary7 | Japan | 0xbf2a... | 49M BLF |
| Notary8 | USA | 0xd03c... | 46M BLF |

**Notary Responsibilities**:
- Publish global state root every 10 seconds
- Sign state root with BLS12-381 aggregated signatures (5 of 8 threshold)
- Validate shard state proofs via STARKs

### 1.3 Shard Topology (127 Shards)

Each shard is a **Crandall clique** of Validator-Routers:

```
Shard N topology:
┌─────────────────────────────────────────────────────────────┐
│ N = floor(τ × stake_weight) where τ = 2.5                   │
│ Full-mesh TLS connections between all VRs in shard          │
│ Deterministic bipartite graph for cross-shard bridges       │
│ Bridge selection: top 5% stake in each shard                │
└─────────────────────────────────────────────────────────────┘
```

#### Example: Shard 0 (North America)

| VR ID | IP Address | Role | Stake | Fee | Flags |
|-------|------------|------|-------|-----|-------|
| VR-0-001 | 203.0.113.9 | Guard | 8.2M BLF | 3 bps | Guard, Bridge, Stable |
| VR-0-015 | 203.0.113.42 | Guard | 15.7M BLF | 2 bps | Guard, Bridge, Fast |
| VR-0-084 | 203.0.113.128 | Guard | 4.1M BLF | 5 bps | Guard |
| VR-0-341 | 203.0.114.55 | Middle | 2.8M BLF | 4 bps | - |
| VR-0-552 | 203.0.115.72 | Middle | 6.3M BLF | 3 bps | - |
| VR-0-891 | 203.0.116.18 | Middle | 1.9M BLF | 6 bps | - |
| SE-0-12 | 203.0.117.5 | Exit | 12.3M BLF | 25 bps | SWIFT, ACH, BTC |
| SE-0-45 | 203.0.117.89 | Exit | 8.7M BLF | 10 bps | ACH only |

**Shard 0 Statistics**:
- Total VRs: 2,407 (as of epoch 18492)
- Guard VRs: ~722 (top 30% by stake)
- Middle VRs: ~1,485
- Settlement Executors: ~200
- Total Stake: 4.82B BLF ($21.7B)
- Avg Stake per VR: 2.01M BLF

### 1.4 Cross-Shard Bridges

**Bridge Selection**: VRs with stake in top 5% of shard become bridges.

```
Bridges per shard: 120
Total cross-shard links: 15,240
Bridge protocol: TLS 1.3 + BLS authentication
Bridge bandwidth: 10 Gbps per link
Bridge latency: 85-92ms (inter-continental)
```

**Example Bridge**:
```
Bridge-0-1: 203.0.113.9 (Shard 0) ↔ 198.51.100.14 (Shard 1)
  Protocol: TLS 1.3
  Bandwidth: 10 Gbps
  Latency: 85ms
  Role: Shard 0 ↔ Shard 1 payment routing
```

### 1.5 Network Visualization

```mermaid
graph TB
    subgraph "Global Consensus Layer (8 Notaries)"
        N1["Notary1<br/>203.0.113.1<br/>BLS: 0x1a2b...<br/>Stake: 50M BLF<br/>Location: Switzerland"]
        N2["Notary2<br/>203.0.113.2<br/>BLS: 0x3c4d...<br/>Stake: 48M BLF<br/>Location: Singapore"]
        N3["Notary3<br/>203.0.113.3<br/>BLS: 0x5e6f...<br/>Stake: 52M BLF<br/>Location: Iceland"]
        N4["Notary4<br/>203.0.113.4<br/>BLS: 0x7a8b...<br/>Stake: 45M BLF<br/>Location: Canada"]
        N5["Notary5<br/>203.0.113.5<br/>BLS: 0x9c0d...<br/>Stake: 51M BLF<br/>Location: New Zealand"]
        N6["Notary6<br/>203.0.113.6<br/>BLS: 0xae1f...<br/>Stake: 47M BLF<br/>Location: Germany"]
        N7["Notary7<br/>203.0.113.7<br/>BLS: 0xbf2a...<br/>Stake: 49M BLF<br/>Location: Japan"]
        N8["Notary8<br/>203.0.113.8<br/>BLS: 0xd03c...<br/>Stake: 46M BLF<br/>Location: USA"]
    end

    subgraph "Shard 0 (North America) - 2,407 VRs"
        subgraph "Guard VRs (Entry) - Top 30% by stake"
            G0["VR-0-001<br/>203.0.113.9<br/>Stake: 8.2M BLF<br/>Fee: 3 bps<br/>Flags: Guard, Bridge, Stable"]
            G1["VR-0-015<br/>203.0.113.42<br/>Stake: 15.7M BLF<br/>Fee: 2 bps<br/>Flags: Guard, Bridge, Fast"]
            G2["VR-0-084<br/>203.0.113.128<br/>Stake: 4.1M BLF<br/>Fee: 5 bps<br/>Flags: Guard"]
        end

        subgraph "Middle VRs - 1,200 nodes"
            M0["VR-0-341<br/>203.0.114.55<br/>Stake: 2.8M BLF<br/>Fee: 4 bps"]
            M1["VR-0-552<br/>203.0.115.72<br/>Stake: 6.3M BLF<br/>Fee: 3 bps"]
            M2["VR-0-891<br/>203.0.116.18<br/>Stake: 1.9M BLF<br/>Fee: 6 bps"]
        end

        subgraph "Settlement Executors (Exits) - 200 nodes"
            E0["SE-0-12<br/>203.0.117.5<br/>Stake: 12.3M BLF<br/>Fee: 25 bps<br/>Rails: SWIFT, ACH, BTC"]
            E1["SE-0-45<br/>203.0.117.89<br/>Stake: 8.7M BLF<br/>Fee: 10 bps<br/>Rails: ACH only"]
        end
    end

    subgraph "Shard 1 (Europe) - 2,800 VRs"
        G10["VR-1-007<br/>198.51.100.14<br/>Stake: 11.2M BLF<br/>Fee: 2 bps<br/>Flags: Guard, Bridge"]
        E10["SE-1-33<br/>198.51.101.67<br/>Stake: 9.8M BLF<br/>Fee: 15 bps<br/>Rails: SEPA, BTC"]
    end

    subgraph "Cross-Shard Bridge Links (15,240 total)"
        B0["Bridge-0-1<br/>203.0.113.9 ↔ 198.51.100.14<br/>TLS 1.3<br/>Bandwidth: 10 Gbps<br/>Latency: 85ms"]
        B1["Bridge-0-1<br/>203.0.113.42 ↔ 198.51.100.203<br/>TLS 1.3<br/>Bandwidth: 10 Gbps<br/>Latency: 92ms"]
    end

    subgraph "Client Infrastructure"
        FP["Finallica Proxy<br/>127.0.0.1:31337<br/>Wallet daemon<br/>Pathfinding engine<br/>Channel manager"]
        WALLET["User Wallet UI<br/>Mobile app<br/>BOLT-11 invoice scanner"]
        API["Merchant API<br/>RFC-5546 payment pointers<br/>Webhook callbacks"]
    end

    subgraph "Legacy Settlement Rails"
        SWIFT["SWIFT Network<br/>MT103 messages<br/>Settlement time: 1-3 days"]
        ACH["ACH Network<br/>NACHA files<br/>Settlement time: 1-2 days"]
        BTC["Bitcoin L1<br/>On-chain tx<br/>Settlement time: 10 min"]
        LN["Bitcoin Lightning<br/>HTLC routing<br/>Settlement time: 3 sec"]
    end

    N1 ---|BLS sign| CONS["Global State Root<br/>SHA256 of all shard roots<br/>8 BLS signatures<br/>Valid: 10 sec"]
    N2 ---|BLS sign| CONS
    N3 ---|BLS sign| CONS
    N4 ---|BLS sign| CONS
    CONS -->|pushed| G0
    CONS -->|pushed| G1
    CONS -->|pushed| M0
    CONS -->|pushed| E0

    G0 <-->|Noise_XX + DPDK<br/>Port 31337| M0
    G0 <-->|Noise_XX + DPDK| M1
    G0 <-->|Noise_XX + DPDK| G1
    M0 <-->|Noise_XX + DPDK| M1
    M0 <-->|Noise_XX + DPDK| E0
    M1 <-->|Noise_XX + DPDK| E1
    G1 <-->|Noise_XX + DPDK| E0

    G0 ---|TLS 1.3 + BLS auth| B0
    G1 ---|TLS 1.3 + BLS auth| B1
    B0 ---|shard 1| G10
    B1 ---|shard 1| G10

    WALLET -->|Noise_XK + TCP| FP
    API -->|Noise_XK + TCP| FP
    FP -->|OPEN cell<br/>Noise handshake| G0
    FP -->|OPEN cell| G1

    E0 -->|MT103| SWIFT
    E1 -->|NACHA| ACH
    E0 -->|Bitcoin RPC| BTC
    E0 -->|gRPC| LN
```

---

## Section 2: End-to-End Payment Flow

### 2.1 Overview: $100 Invoice to Settlement

Total time: **1-3 days** (dominated by SWIFT settlement)
Internal processing: **~260ms** (channel build + HTLC attachment)

```
Phase 1: Invoice Parsing & Route Selection     (12ms)
Phase 2: Channel Construction                  (247ms p50)
Phase 3: HTLC Attachment                       (5ms)
Phase 4: Settlement Execution                  (1-3 days SWIFT)
Phase 5: Channel Rebalance                     (optional, 30s)
```

### 2.2 Phase 1: Invoice Parsing & Route Selection (12ms)

```mermaid
sequenceDiagram
    participant User as User<br/>Payer
    participant Wallet as Wallet UI<br/>Mobile app
    participant FP as Finallica Proxy<br/>127.0.0.1:31337
    participant Dir as Directory Cache<br/>/var/lib/finallica/consensus.dat

    Note over User,Dir: Phase 1: Invoice Parsing & Route Selection (12ms)
    User->>Wallet: Scan BOLT-11 invoice<br/>lnbc10u1p3y...xyz
    Wallet->>Wallet: decode_bolt11()<br/>amount=$100<br/>payment_hash=0x1a2b...<br/>expiry=3600s
    Wallet->>FP: pay_invoice(invoice, amount=10,000,000 microcents)
    FP->>Dir: get_vr_path(amount=10M, dest_shard=0, currency=USD)
    Dir-->>FP: Path: G0(3bps) → M1(4bps) → E0(25bps)<br/>Total fee: 32bps ($0.32)
    FP->>FP: select_entry_guard()<br/>Chosen: VR-0-015 (stake=15.7M, fee=2bps)<br/>Recalc fee: 31bps ($0.31)
```

**Route Selection Algorithm**:

```c
struct vr_path *select_path(
  uint64_t amount_microcents,
  uint16_t dest_shard_id,
  uint8_t required_flags) {

  // Step 1: Guard selection (persistent)
  struct entry_guard *guard = get_guard_by_shard(0);

  // Formula: weight = stake^0.7 * uptime_factor / fee_bps^2
  double weight = pow(guard->stake, 0.7) *
                  (guard->uptime_days / 30.0) /
                  (guard->fee_bps * guard->fee_bps);

  // Step 2: Middle VR selection (probabilistic)
  // Top 50 by stake, reservoir sampling

  // Step 3: Exit VR selection
  // Filter by currency support, fee < 50 bps, latency < 500ms

  return path;
}
```

### 2.3 Phase 2: Channel Construction (247ms p50)

```mermaid
sequenceDiagram
    participant FP as Finallica Proxy
    participant G as Guard VR<br/>VR-0-015
    participant M as Middle VR<br/>VR-0-552
    participant E as Settlement Executor<br/>SE-0-12

    Note over FP,E: Phase 2: Channel Construction (247ms p50)
    FP->>G: OPEN2 cell (Noise_XX)<br/>channel_id=0x4f3e2d1c<br/>ephemeral=0x9f8e..., amount=10M<br/>BLS sign: σ_payer
    G->>G: noise_handshake_process()<br/>X25519 DH: 90µs<br/>BLAKE2s KDF: 25µs<br/>BLS verify: 105µs (batch)
    G->>FP: OPENED2 cell<br/>channel_id=0x4f3e2d1c<br/>K_entry derived<br/>g^y, BLS sig: σ_guard
    FP->>FP: KDF_Noise(g^xy) → K_pay || K_settle || K_pad

    FP->>G: EXTEND cell (encrypted w/ K_pay)<br/>Target: VR-0-552 pubkey<br/>ephemeral_mid=0x7d6c...
    G->>M: OPEN2 cell (new channel_id=0x8a7b6c5d)<br/>Noise handshake
    M->>G: OPENED2 cell
    G->>FP: EXTENDED cell<br/>K_mid derived

    FP->>G: EXTEND2 cell (encrypted K_mid)<br/>Target: SE-0-12 pubkey<br/>ephemeral_exit=0x5b4a...
    M->>E: OPEN2 cell (channel_id=0x9c8d7e6f)
    E->>M: OPENED2 cell
    M->>G: EXTENDED2
    G->>FP: EXTENDED2<br/>K_exit derived<br/>Total: 3 hops built
```

**Noise_XX Handshake Transcript**:

```
// Prologue (client → VR)
-> e  (ephemeral pubkey: 32-byte X25519)

// VR response with stake proof
<- e, ee, s, es
   e = VR ephemeral pubkey
   ee = DH(e_client, e_vr) → shared secret
   s = VR BLS12-381 pubkey (48 bytes, compressed G1)
   es = DH(e_client, s_vr) → stake binding

// Client authentication
-> s, se, psk
   s = client BLS pubkey (48 bytes)
   se = DH(e_vr, s_client)
   psk = pre-shared key from stake delegation certificate
```

### 2.4 Phase 3: HTLC Attachment (5ms)

```mermaid
sequenceDiagram
    participant FP as Finallica Proxy
    participant G as Guard VR
    participant M as Middle VR
    participant E as Settlement Executor

    Note over FP,E: Phase 3: HTLC Attachment (5ms)
    FP->>FP: attach_payment_stream()<br/>stream_id=0x0042<br/>assign_htlc_id=0x123456789abc
    FP->>G: PAY cell (stream_id=0x0042)<br/>Encrypted w/ K_pay:<br/>{amount=10M, expiry=1706035200<br/>payment_hash=0x1a2b...<br/>next_hop=VR-0-552}<br/>Pedersen commitment: C = v*G + b*H
    G->>M: PAY cell (stream_id=0x0042)<br/>Encrypted w/ K_mid<br/>Deduct from channel balance: -10M microcents
    M->>E: PAY cell (stream_id=0x0042)<br/>Encrypted w/ K_exit<br/>Deduct: -10M microcents
    E->>E: Record HTLC: id=0x123456789abc<br/>amount=10M, hash=0x1a2b...<br/>timeout=1706035200
```

### 2.5 Phase 4: Settlement Execution (1-3 days SWIFT)

```mermaid
sequenceDiagram
    participant E as Settlement Executor
    participant Bank as Beneficiary Bank<br/>SWIFT: CHASUS33XXX
    participant M as Middle VR
    participant G as Guard VR
    participant FP as Finallica Proxy
    participant Wallet as Wallet UI

    Note over E,Wallet: Phase 4: Settlement Execution (1-3 days SWIFT)
    E->>Bank: SWIFT MT103 message<br/>Beneficiary: CHASUS33XXX<br/>Amount: $99.69 (after fees)<br/>Reference: SHA256(payment_preimage)
    Bank->>Bank: Process incoming SWIFT<br/>Credit beneficiary account
    Bank->>E: MT900 confirmation (1-3 days)

    E->>M: SETTLE cell (stream_id=0x0042)<br/>preimage=0xfedcba...<br/>BLS settle sig: σ_exit
    M->>G: SETTLE cell
    G->>FP: SETTLE cell<br/>Verify: SHA256(preimage) == payment_hash ✓
    FP->>Wallet: Payment settled<br/>Txid: 0xdeadbeef...<br/>Fee: $0.31<br/>Net: $99.69
```

### 2.6 Phase 5: Channel Rebalance (optional, 30s)

```mermaid
sequenceDiagram
    participant FP as Finallica Proxy
    participant E as Settlement Executor

    Note over FP,E: Phase 5: Channel Rebalance (optional, 30s)
    FP->>E: REBALANCE cell<br/>Atomic swap: 5M microcents to refill channel
    E->>FP: REBALANCE_ACK<br/>Channel: 0x4f3e2d1c<br/>New balance: 15M microcents
```

---

## Key Takeaways

1. **Network Scale**: 127 shards, 12,000 VRs, 8 notaries
2. **Path Selection**: Stake-weighted, 3 hops (Guard → Middle → Exit)
3. **Channel Build**: 247ms p50 via Noise_XX handshakes
4. **Settlement**: 200ms internal finality, 1-3 days external (SWIFT)
5. **Privacy**: Layered encryption, Pedersen commitments, 1-in-1,200 anonymity

---

*Next: [PROTOCOL_SPECIFICATION.md](./PROTOCOL_SPECIFICATION.md) - State Machines & Cell Processing*
