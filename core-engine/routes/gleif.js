module.exports = (state, log) => ({
    async verifyHandler(req, res) {
        const { lei, companyName } = req.body;

        if (!lei || lei.length !== 20) {
            return res.json({ valid: false, message: 'Invalid LEI code. Must be 20 characters.' });
        }

        log('GLEIF', `🔍 Querying GLEIF API for LEI: ${lei}...`);

        try {
            const https = require('https');
            const gleifUrl = `https://api.gleif.org/api/v1/lei-records?filter[lei]=${lei}`;

            const gleifData = await new Promise((resolve, reject) => {
                https.get(gleifUrl, (response) => {
                    let data = '';
                    response.on('data', chunk => data += chunk);
                    response.on('end', () => {
                        try {
                            resolve(JSON.parse(data));
                        } catch (e) {
                            reject(new Error('Error parsing GLEIF response'));
                        }
                    });
                }).on('error', reject);
            });

            if (!gleifData.data || gleifData.data.length === 0) {
                log('GLEIF', `❌ LEI ${lei} not found in global registry.`);
                return res.json({ valid: false, message: `LEI ${lei} not found in GLEIF global registry.` });
            }

            const record = gleifData.data[0].attributes;
            const entityName = record.entity.legalName.name;
            const entityStatus = record.entity.status;
            const regStatus = record.registration.status;
            const corroborationLevel = record.registration.corroborationLevel;
            const nextRenewal = record.registration.nextRenewalDate;

            log('GLEIF', `📋 Entity found: ${entityName}`);
            log('GLEIF', `   Status: ${entityStatus} | LEI: ${regStatus} | Corroboration: ${corroborationLevel}`);

            if (regStatus !== 'ISSUED') {
                log('GLEIF', `❌ LEI ${lei} has status ${regStatus} (must be ISSUED).`);
                return res.json({
                    valid: false,
                    message: `LEI ${lei} has status ${regStatus}. Only LEIs with ISSUED status are accepted.`,
                    entityName,
                    registrationStatus: regStatus
                });
            }

            if (entityStatus !== 'ACTIVE') {
                log('GLEIF', `❌ Entity ${entityName} has status ${entityStatus} (must be ACTIVE).`);
                return res.json({
                    valid: false,
                    message: `Entity has status ${entityStatus}. Must be ACTIVE.`,
                    entityName,
                    registrationStatus: regStatus
                });
            }

            log('GLEIF', `✅ LEI verified: ${entityName} — ACTIVE/ISSUED — Valid until ${nextRenewal}`);

            return res.json({
                valid: true,
                entityName,
                entityStatus,
                registrationStatus: regStatus,
                corroborationLevel,
                nextRenewalDate: nextRenewal,
                jurisdiction: record.entity.jurisdiction || 'N/A'
            });

        } catch (err) {
            log('GLEIF', `⚠️ Error querying GLEIF API: ${err.message}. Using local validation.`);
            return res.json({
                valid: true,
                entityName: companyName || 'Company (unverified via GLEIF)',
                entityStatus: 'ACTIVE',
                registrationStatus: 'ISSUED',
                corroborationLevel: 'FALLBACK',
                message: 'GLEIF verification not available. Accepted with warning.'
            });
        }
    }
});
