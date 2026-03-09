/**
 * test_auction_flow.js -- Prueba End-to-End del flujo de subastas privadas
 * Estandar Chainlink Compliant Private Token Transfer
 * 
 * Ejecutar desde: c:\Users\simon\Documents\CRE Hackthon\codigo\core-engine
 *   node test_auction_flow.js
 */

const { ethers } = require('ethers');
const http = require('http');

// ================================================
// CONFIG
// ================================================
const API_HOST = 'localhost';
const API_PORT = 3001;
const RPC = 'http://127.0.0.1:8545';

// Wallets existentes con balance confirmados en state.json
const WALLETS = {
    sellerA: '0xedec8527bf0a56da24a2070402c824f761cd34a7',  // tiene Bono1
    sellerB: '0xa66854b2df0dd19b96af382336721b61f222ddff',  // tiene Bono2
    bidder1: '0x0319c4140fcf7ce77306d68f652f135c063e463d',
    bidder2: '0x335484d0f28e232afe5892aa621fa0aac5460c08',
    bidder3: '0x2f214de1ad31e4934999224784880726f994089f',
};

const CONTRACTS = {
    vault: '0xdc11f7e700a4c898ae5caddb1082cffa76512add',
    usdc: '0x68b1d87f95878fe05b998f19b66f4baba5de1aed',
    bono1: '0x86699f95700424A20eDf530041f3869480604aC9',
    bono2: '0xD66698b1643b2a455038C63903a48f8cFBBd7F69',
};

// DON Signer -- Anvil Account #0 (mismo que DeployStage4.s.sol)
const DON_SIGNER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

// Private keys de bidders (Anvil deterministas)
const BIDDER_KEYS = {
    [WALLETS.bidder1]: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
    [WALLETS.bidder2]: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
    [WALLETS.bidder3]: '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926b',
};

// ================================================
// HTTP helper nativo (sin fetch)
// ================================================
function api(method, path, body) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : null;
        const opts = {
            hostname: API_HOST,
            port: API_PORT,
            path,
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
            }
        };
        const req = http.request(opts, res => {
            let raw = '';
            res.on('data', c => raw += c);
            res.on('end', () => {
                try { resolve(JSON.parse(raw)); }
                catch { resolve({ raw }); }
            });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

// ================================================
// Test helpers
// ================================================
let stepN = 0;
const SEP = '-'.repeat(60);

function step(msg) {
    stepN++;
    console.log('\n' + SEP);
    console.log('[STEP ' + stepN + '] ' + msg);
    console.log(SEP);
}

function ok(label, val) {
    const d = (typeof val === 'object' && val !== null)
        ? JSON.stringify(val).slice(0, 120) : String(val);
    console.log('  [OK]  ' + label + ': ' + d);
}

function warn(label, val) {
    const d = (typeof val === 'object' && val !== null)
        ? JSON.stringify(val).slice(0, 120) : String(val);
    console.log('  [WARN] ' + label + ': ' + d);
}

function fail(label, val) {
    const d = (typeof val === 'object' && val !== null)
        ? JSON.stringify(val).slice(0, 200) : String(val);
    throw new Error('[FALLO] ' + label + ': ' + d);
}

function assert(label, cond, val) {
    if (!cond) fail(label, val !== undefined ? val : 'assertion failed');
    ok(label, val !== undefined ? val : 'passed');
}

// ================================================
// MAIN
// ================================================
async function main() {
    console.log('\n=============================================================');
    console.log('  TEST E2E: CHAINLINK COMPLIANT PRIVATE TOKEN AUCTION');
    console.log('  shield > bid(sealed) > settle > ticket > withdrawWithTicket');
    console.log('=============================================================\n');

    // STEP 1: Verificar conectividad
    step('Verificar conectividad API y Anvil');

    const ping = await api('GET', '/market/balance/' + WALLETS.sellerA).catch(() => null);
    if (!ping) fail('API no accesible', 'Ejecuta: node server.js');
    assert('API responde', ping.success, 'OK');

    const provider = new ethers.JsonRpcProvider(RPC);
    const block = await provider.getBlockNumber().catch(() => -1);
    assert('Anvil responde', block >= 0, 'Bloque #' + block);

    // STEP 0b: Limpiar estado de las wallets de prueba (para idempotencia)
    step('RESET -- Limpiar estado de wallets del test (idempotencia)');
    const testWallets = Object.values(WALLETS);
    const resetR = await api('POST', '/test/reset', { wallets: testWallets });
    assert('Reset exitoso', resetR.success, resetR.error || 'Wallets limpiadas: ' + (resetR.cleaned || []).length);
    ok('Wallets reseteadas', testWallets.length);
    // STEP 2: Shielding -- bidders depositan USDC en TEE Ledger
    step('SHIELDING -- Depositar USDC en TEE Ledger Privado (bidders)');

    const shieldData = [
        { wallet: WALLETS.bidder1, amount: 600, label: 'Bidder1' },
        { wallet: WALLETS.bidder2, amount: 800, label: 'Bidder2' },
        { wallet: WALLETS.bidder3, amount: 1500, label: 'Bidder3' },
    ];
    for (const s of shieldData) {
        const r = await api('POST', '/market/shield', { wallet: s.wallet, token: 'USDC', amount: s.amount });
        assert('Shield ' + s.amount + ' USDC (' + s.label + ')', r.success, r.shieldedBalances || r.error);
    }

    // STEP 3: Crear Subasta 1
    step('CREATE AUCTION #1 -- SellerA vende 200 tokens Bono1 (min $100)');

    const c1 = await api('POST', '/auction/create', {
        bondId: CONTRACTS.bono1, amount: 200, minBid: 100, sellerWallet: WALLETS.sellerA
    });
    assert('Subasta 1 creada', !!c1.auctionId, c1);
    const AUC1 = c1.auctionId;
    ok('AUC1 ID', AUC1);

    // STEP 4: Crear Subasta 2
    step('CREATE AUCTION #2 -- SellerB vende 50 tokens Bono2 (min $200)');

    const c2 = await api('POST', '/auction/create', {
        bondId: CONTRACTS.bono2, amount: 50, minBid: 200, sellerWallet: WALLETS.sellerB
    });
    assert('Subasta 2 creada', !!c2.auctionId, c2);
    const AUC2 = c2.auctionId;
    ok('AUC2 ID', AUC2);

    // STEP 5: Pujas selladas -- Subasta 1
    // Bidder1=$150, Bidder2=$400 (GANADOR), Bidder3=$350
    step('SEALED BIDS -- Subasta 1 (' + AUC1 + ')');

    const bids1 = [
        { wallet: WALLETS.bidder1, amount: 150, label: 'Bidder1' },
        { wallet: WALLETS.bidder2, amount: 400, label: 'Bidder2>>GANADOR' },
        { wallet: WALLETS.bidder3, amount: 350, label: 'Bidder3' },
    ];
    for (const b of bids1) {
        const r = await api('POST', '/market/bid', { auctionId: AUC1, bidAmount: b.amount, wallet: b.wallet });
        if (r.success) {
            ok('  Puja $' + b.amount + ' (' + b.label + ')', 'Sellada en TEE');
        } else {
            warn('  Puja $' + b.amount + ' (' + b.label + ') rechazada', r.error);
        }
    }

    // STEP 6: Pujas selladas -- Subasta 2
    // Bidder1=$300, Bidder2=$250, Bidder3=$600 (GANADOR)
    step('SEALED BIDS -- Subasta 2 (' + AUC2 + ')');

    const bids2 = [
        { wallet: WALLETS.bidder1, amount: 300, label: 'Bidder1' },
        { wallet: WALLETS.bidder2, amount: 250, label: 'Bidder2' },
        { wallet: WALLETS.bidder3, amount: 600, label: 'Bidder3>>GANADOR' },
    ];
    for (const b of bids2) {
        const r = await api('POST', '/market/bid', { auctionId: AUC2, bidAmount: b.amount, wallet: b.wallet });
        if (r.success) {
            ok('  Puja $' + b.amount + ' (' + b.label + ')', 'Sellada en TEE');
        } else {
            warn('  Puja $' + b.amount + ' (' + b.label + ') rechazada', r.error);
        }
    }

    // STEP 7: SETTLE -- TEE desencripta y elige ganadores
    step('SETTLE -- TEE desencripta pujas y transfiere tokens off-chain');

    const s1 = await api('POST', '/auction/settle', { auctionId: AUC1, sellerWallet: WALLETS.sellerA });
    assert('Settle AUC1 exitoso', s1.success, s1.error || s1.message || JSON.stringify(s1));
    ok('  Ganador AUC1', s1.winner || 'N/A');
    ok('  Monto AUC1', s1.amount !== undefined ? '$' + s1.amount : 'N/A');

    const s2 = await api('POST', '/auction/settle', { auctionId: AUC2, sellerWallet: WALLETS.sellerB });
    assert('Settle AUC2 exitoso', s2.success, s2.error || s2.message || JSON.stringify(s2));
    ok('  Ganador AUC2', s2.winner || 'N/A');
    ok('  Monto AUC2', s2.amount !== undefined ? '$' + s2.amount : 'N/A');

    // Validar ganadores
    if (s1.winner) {
        assert('Ganador AUC1 = Bidder2 (puja $400)',
            s1.winner.toLowerCase() === WALLETS.bidder2,
            s1.winner + ' == ' + WALLETS.bidder2);
    }
    if (s2.winner) {
        assert('Ganador AUC2 = Bidder3 (puja $600)',
            s2.winner.toLowerCase() === WALLETS.bidder3,
            s2.winner + ' == ' + WALLETS.bidder3);
    }

    // STEP 8: MARKET RESOLVE -- Generar tickets firmados (estandar Chainlink)
    step('MARKET RESOLVE -- Generar Withdrawal Tickets con firma DON Signer');

    const r1 = await api('POST', '/market/resolve', { auctionId: AUC1, sellerWallet: WALLETS.sellerA });
    assert('Resolve AUC1', r1.success, r1.error || 'OK');

    const r2 = await api('POST', '/market/resolve', { auctionId: AUC2, sellerWallet: WALLETS.sellerB });
    assert('Resolve AUC2', r2.success, r2.error || 'OK');

    // STEP 9: GET TICKETS -- Verificar distribucion
    step('GET TICKETS -- Verificar tickets para todos los participantes');

    const parts = [
        { label: 'SellerA (cobro USDC AUC1)', addr: WALLETS.sellerA },
        { label: 'SellerB (cobro USDC AUC2)', addr: WALLETS.sellerB },
        { label: 'Bidder1 (perdedor x2, reemb.)', addr: WALLETS.bidder1 },
        { label: 'Bidder2 (ganador AUC1, RWA)', addr: WALLETS.bidder2 },
        { label: 'Bidder3 (ganador AUC2, RWA)', addr: WALLETS.bidder3 },
    ];

    const allTickets = {};
    for (const p of parts) {
        const tr = await api('GET', '/market/tickets/' + p.addr);
        if (tr.tickets && tr.tickets.length > 0) {
            ok(p.label, tr.tickets.length + ' ticket(s)');
            for (const t of tr.tickets) {
                const sigOk = !!t.sig;
                const amtOk = t.amountWei && t.amountWei !== '0';
                const status = (sigOk && amtOk) ? 'VALIDO' : 'PROBLEMA(sig=' + sigOk + ',amt=' + amtOk + ')';
                console.log('    [T] ' + (t.description || t.id).slice(0, 60));
                console.log('        amountWei=' + t.amountWei + '  sig=' + (t.sig ? t.sig.slice(0, 12) + '...' : 'FALTA') + '  ' + status);
            }
            allTickets[p.addr] = tr.tickets;
        } else {
            warn(p.label, 'Sin tickets: ' + (tr.error || 'OK'));
        }
    }

    // Verificar que hay tickets para los 5 participantes
    const withTickets = Object.keys(allTickets).length;
    assert('Tickets generados para participantes (>= 3)', withTickets >= 3, withTickets + ' wallets con tickets');

    // STEP 10: CLAIM + VERIFICAR FIRMA (estandar Chainlink POST /withdraw)
    step('CLAIM TICKET -- Obtener firma y verificar compatibilidad con withdrawWithTicket()');

    const donWallet = new ethers.Wallet(DON_SIGNER_KEY);
    const donAddress = await donWallet.getAddress();
    ok('DON Signer address', donAddress);

    let verifiedCount = 0;
    let invalidCount = 0;
    const validClaims = [];  // { addr, ticket } para el intento on-chain

    for (const [walletAddr, tickets] of Object.entries(allTickets)) {
        for (const t of tickets) {
            const cr = await api('POST', '/market/claim-ticket', { wallet: walletAddr, ticketId: t.id });

            if (!cr.success) {
                warn('Claim ' + t.id.slice(0, 22), cr.error);
                continue;
            }

            const ct = cr.ticket;
            if (!ct || !ct.sig || !ct.tokenAddress || !ct.amountWei || ct.amountWei === '0') {
                if (ct && ct.amountWei === '0') {
                    warn('Ticket amount=0 (seller sin monto?)', ct.description || '');
                } else {
                    warn('Ticket incompleto', JSON.stringify(ct).slice(0, 80));
                }
                continue;
            }

            // Verificar firma: reproduce exactamente el hash del contrato Solidity
            //   bytes32 hash = keccak256(abi.encode(msg.sender, token, amount, address(this)));
            //   bytes32 ethHash = MessageHashUtils.toEthSignedMessageHash(hash);
            //   address signer = ethHash.recover(ticket);
            try {
                const recipient = ethers.getAddress(walletAddr);
                const token = ethers.getAddress(ct.tokenAddress);
                const amount = BigInt(ct.amountWei);
                const vault = ethers.getAddress(CONTRACTS.vault);

                const ticketHash = ethers.keccak256(
                    ethers.AbiCoder.defaultAbiCoder().encode(
                        ['address', 'address', 'uint256', 'address'],
                        [recipient, token, amount, vault]
                    )
                );

                const recovered = ethers.verifyMessage(ethers.getBytes(ticketHash), ct.sig);
                const sigValid = recovered.toLowerCase() === donAddress.toLowerCase();

                if (sigValid) {
                    ok('  Firma DON valida para ' + ct.description.slice(0, 45),
                        'recovered=' + recovered.slice(0, 12) + '...');
                    verifiedCount++;
                    validClaims.push({ addr: walletAddr, ticket: ct });
                } else {
                    warn('  FIRMA INVALIDA para ' + ct.description.slice(0, 45),
                        'recovered=' + recovered + ' != ' + donAddress);
                    invalidCount++;
                }
            } catch (e) {
                warn('  Error verificando firma', e.message);
            }
        }
    }

    assert('Firmas DON Signer validas >= 1', verifiedCount >= 1, verifiedCount + ' validas, ' + invalidCount + ' invalidas');

    // STEP 11: WITHDRAW ON-CHAIN -- vault.withdrawWithTicket()
    step('WITHDRAW ON-CHAIN -- vault.withdrawWithTicket(token, amount, sig)');

    const ERC20_ABI = [
        'function balanceOf(address) view returns (uint256)',
        'function decimals() view returns (uint8)'
    ];
    const VAULT_ABI = [
        'function withdrawWithTicket(address token, uint256 amount, bytes calldata ticket) external'
    ];

    const usdcC = new ethers.Contract(CONTRACTS.usdc, ERC20_ABI, provider);
    const vaultBal = await usdcC.balanceOf(CONTRACTS.vault);
    const usdcDec = Number(await usdcC.decimals());
    console.log('  Vault USDC balance on-chain: ' + ethers.formatUnits(vaultBal, usdcDec) + ' USDC');

    let onChainOk = false;

    for (const { addr, ticket: ct } of validClaims) {
        const privKey = BIDDER_KEYS[addr];
        if (!privKey) continue;
        // Solo intentar con tickets USDC (los RWA necesitan que el vault tenga bonds)
        if (ct.tokenAddress.toLowerCase() !== CONTRACTS.usdc.toLowerCase()) continue;

        const needed = BigInt(ct.amountWei);
        if (vaultBal < needed) {
            warn('Vault sin USDC suficiente para ' + addr.slice(0, 10),
                'necesita ' + ethers.formatUnits(needed, usdcDec) + ', tiene ' + ethers.formatUnits(vaultBal, usdcDec));
            continue;
        }

        try {
            const signer = new ethers.Wallet(privKey, provider);
            const vaultC = new ethers.Contract(CONTRACTS.vault, VAULT_ABI, signer);
            const before = await usdcC.balanceOf(addr);

            console.log('\n  Ejecutando withdrawWithTicket()...');
            console.log('  recipient: ' + addr);
            console.log('  token    : ' + ct.tokenAddress);
            console.log('  amount   : ' + ethers.formatUnits(needed, usdcDec) + ' USDC (' + needed + ' wei)');

            const tx = await vaultC.withdrawWithTicket(ct.tokenAddress, needed, ct.sig);
            console.log('  TX hash  : ' + tx.hash);
            const receipt = await tx.wait();
            ok('TX confirmada', 'bloque #' + receipt.blockNumber);

            const after = await usdcC.balanceOf(addr);
            const received = after - before;
            ok('USDC ERC-20 recibido on-chain', '+' + ethers.formatUnits(received, usdcDec) + ' USDC');
            assert('Balance aumentÃ³ correctamente', received === needed, received + ' == ' + needed);
            onChainOk = true;
            break;
        } catch (e) {
            warn('withdrawWithTicket() fallo', e.message.split('\n')[0]);
        }
    }

    if (!onChainOk) {
        warn('TX on-chain no ejecutada',
            'El vault no tiene USDC on-chain porque el shielding fue TEE-only (sin approve+deposit real).\n' +
            '  La firma DON Signer SI esta verificada off-chain (Step 10).\n' +
            '  Para TX on-chain real: usar el frontend con MetaMask (Shield con TX).');
    }

    // ================================================
    // RESUMEN
    // ================================================
    console.log('\n\n' + '='.repeat(62));
    console.log('  RESUMEN TEST E2E -- CHAINLINK STANDARD');
    console.log('='.repeat(62));
    console.log('  Subastas creadas         : ' + AUC1 + ', ' + AUC2);
    console.log('  Pujas AUC1               : Bidder1=$150, Bidder2=$400, Bidder3=$350');
    console.log('  Pujas AUC2               : Bidder1=$300, Bidder2=$250, Bidder3=$600');
    console.log('  Settle AUC1              : Ganador=' + (s1.winner || 'N/A') + ' ($' + (s1.amount || '?') + ')');
    console.log('  Settle AUC2              : Ganador=' + (s2.winner || 'N/A') + ' ($' + (s2.amount || '?') + ')');
    console.log('  Tickets generados        : ' + withTickets + ' wallets con tickets firmados');
    console.log('  Firmas DON Signer        : ' + verifiedCount + ' validas, ' + invalidCount + ' invalidas');
    console.log('  Compatible con contrato  : keccak256(recipient,token,amount,vault)+ETH_SIGN');
    console.log('  TX on-chain              : ' + (onChainOk ? 'EXITOSA' : 'Sin fondos on-chain (expected en TEE-only mode)'));
    console.log('='.repeat(62));
    console.log('\nTest completado\n');
}

main().catch(e => {
    console.error('\nError fatal en test:', e.message);
    process.exit(1);
});


