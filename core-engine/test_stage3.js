const http = require('http');

async function post(path, data) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: '127.0.0.1',
            port: 3001,
            path: path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (d) => body += d);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    console.error('Failed to parse body:', body);
                    reject(e);
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.write(JSON.stringify(data));
        req.end();
    });
}

async function get(path) {
    return new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:3001${path}`, (res) => {
            let body = '';
            res.on('data', (d) => body += d);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    console.error('Failed to parse body from GET:', path, body);
                    reject(e);
                }
            });
        }).on('error', (e) => reject(e));
    });
}

async function runTests() {
    try {
        console.log('--- Starting Stage 3 Backend Tests ---');

        // 1. Verify Price Feed
        const price = await get('/pricefeed/eth-usd');
        console.log('✅ Price Feed:', price.answer / (10 ** price.decimals), 'USD');

        // 2. Register Company to have issuance permissions
        const companyWallet = "0xCompanyTest" + Math.floor(Math.random() * 1000);
        await post('/kyc/start', {
            wallet: companyWallet,
            type: 'company',
            name: 'Test Corp',
            email: 'test@corp.com',
            docHash: '0x123456789'
        });
        console.log('✅ Company Registered:', companyWallet);

        // 3. Issue Bond
        const bond = await post('/issuance/create', {
            bondName: "Stage 3 Test Bond",
            nominalValue: 500000,
            collateralId: "COL-99",
            destinationChain: "Sepolia",
            ownerWallet: companyWallet
        });
        console.log('DEBUG: Bond response:', bond);
        const bondId = bond.bondAddress;
        console.log('✅ Bond Created:', bondId);

        // 3. Run Monitor (Healthy)
        const monitor1 = await post('/por/monitor', { bondId });
        console.log('✅ Monitor 1 (Healthy):', monitor1.ratio + '%', 'Status:', monitor1.status);

        // 4. Simulate Deficit
        await post('/bank/reserves/update', { collateralId: 'COL-99', newAmount: 10000 });
        console.log('⚠️ Deficit Simulated in COL-99 ($10,000)');

        // 5. Run Monitor (Risk)
        const monitor2 = await post('/por/monitor', { bondId });
        console.log('✅ Monitor 2 (Risk):', monitor2.ratio + '%', 'Status:', monitor2.status);

        // 6. Attempt Purchase
        const trading = await post('/trading/buy', { bondId, amountUSD: 100, buyerWallet: '0xTest' });
        if (trading.error) {
            console.log('✅ Trading correctly blocked:', trading.error);
        } else {
            console.log('❌ Error: Trading should have been blocked.');
        }

        console.log('--- Stage 3 Test Completed Successfully ---');
    } catch (e) {
        console.error('❌ Error in test:', e);
    }
}

runTests();
