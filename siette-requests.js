const soapRequest = require('easy-soap-request');
const xml2js = require('xml2js');
const parser = xml2js.Parser();
//const fs = require('fs');
const crypto = require('crypto');
const https = require('https');
//const { urlencoded } = require('express');

// Services request data
const sietteServicesUrl = "https://siette.test.iaia.lcc.uma.es/siette/services/External";
const sietteExpiredSessionHeader = {
    'Content-Type': 'text/xml;charset=UTF-8',
    SOAPAction: 'https://siette.test.iaia.lcc.uma.es/siette/services/External?method=hasExpiredSIETTESession',
};
const sietteBeginTestSessionHeader = {
    'Content-Type': 'text/xml;charset=UTF-8',
    SOAPAction: 'https://siette.test.iaia.lcc.uma.es/siette/services/External?method=beginTestSession',
};
const sietteExpiredSessionBody = (token) => 
`
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:web="https://siette.test.iaia.lcc.uma.es/siette/services/External">
    <soapenv:Body>
        <web:hasExpiredSIETTESession>
            <web:credentialIdentifier>${token}</web:credentialIdentifier>
        </web:hasExpiredSIETTESession>
    </soapenv:Body>
</soapenv:Envelope>
`;
const sietteBeginTestSessionBody = (idTest, isColaborative, hostAddress, userName, systemId, signature) => 
`
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:web="https://siette.test.iaia.lcc.uma.es/siette/services/External">
    <soapenv:Body>
        <web:beginTestSession>
            <web:idTest>${idTest}</web:idTest>
            <web:colaborative>${isColaborative}</web:colaborative>
            <web:hostAddress>${hostAddress}</web:hostAddress>
            <web:userName>${userName}</web:userName>
            <web:systemIdentifier>${systemId}</web:systemIdentifier>
            <web:rsaSha1Signature>${signature}</web:rsaSha1Signature>
        </web:beginTestSession>
    </soapenv:Body>
</soapenv:Envelope>
`;

// Utils
function parseStringAsync(xml) {
    return new Promise((resolve, reject) => {
        parser.parseString(xml, (err, result) => {
            if (err) {
                reject(err);
            } else {
                resolve(result);
            }
        });
    });
}

function getAnswerResult(data) {
    try {
        return data.items && data.items.item && data.items.item[0].responses[0]['$'].correct === 'true';
    } catch (error) {
        return false;
    }
    
}

// Services
async function hasExpiredSession(token, timeout) {
    const { response } = await soapRequest({ url: sietteServicesUrl, 
        headers: sietteExpiredSessionHeader, 
        xml: sietteExpiredSessionBody(token), 
        timeout: timeout });
    
    let result = null;

    parser.parseString(response.body, function (err, bodyObject) {
        result = bodyObject['soapenv:Envelope']['soapenv:Body'][0].multiRef[0]._;
    });

    result = result == "true";
    return { response, result };
}

async function beginTestSession(idTest, isColaborative, hostAddress, userName, systemId, signature, timeout) {
    const { response } = await soapRequest({ url: sietteServicesUrl, 
        headers: sietteBeginTestSessionHeader, 
        xml: sietteBeginTestSessionBody(idTest, isColaborative, hostAddress, userName, systemId, signature), 
        timeout: timeout });
    
    let result = null;
    
    try {
        const bodyObject = await parseStringAsync(response.body);
        result = bodyObject['soapenv:Envelope']['soapenv:Body'][0].multiRef[0]._;
    } catch (err) {
        console.log('Error parsing XML:', err);
    }

    if (!result) throw Error("Error in beginTestSession:" + response);

    console.log(result);

    return { response, result, signature };
}

async function createTestSession(idTest, userName) {
    //const privateKey = fs.readFileSync('security/priv.pem');
    const privateKey = process.env.SIETTE_KEY;
    const signer = crypto.createSign('RSA-SHA1');
    const toSign = userName + "trivial";
    signer.update(toSign);
    const signature = signer.sign(privateKey, 'base64');

    return await beginTestSession(idTest, false, null, userName, "trivial", signature, 1000);
}

function startTestSession(idSession, token, signature) {
    return new Promise((resolve, reject) => {
        const path = "/siette/external/student/siette?idsession=" + idSession + "&auth=" + token + "&xml=1";
        const options = {
            hostname: 'www.siette.org',
            path: path,
            method: 'GET',
            headers: {
            'Cookie': 'siette.user=' + signature,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.93 Safari/537.36'
            }
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                //console.log('Response:', data);
                parser.parseString(data, (err, result) => {
                    if (err) {
                        console.error('Error parsing XML:', err);
                        reject();
                    } else {
                        try {
                            console.log(result);
                            resolve(result.test['$'].jsessionid);
                        } catch (error) {
                            console.log("Error getting sessionId", error, JSON.stringify(result));
                            reject();
                        } 
                    }
                });
            });
        });
        req.on('error', (error) => {
            console.error('Error:', error);
        });
        req.end();
    });
}

function getNextQuestion(jsessionId, signature) {
    return new Promise((resolve, reject) => {
        const path = "/siette/generador/Pregunta;jsessionid=" + jsessionId;
        const options = {
            hostname: 'www.siette.org',
            path: path,
            method: 'GET',
            headers: {
                'Cookie': 'siette.user=' + signature,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.93 Safari/537.36'
            }
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                console.log('Response:', data);
                parser.parseString(data, (err, result) => {
                    if (err) {
                        console.error('Error parsing XML:', err);
                        reject();
                    } else {
                        resolve(result);
                    }
                });
            });
        });
        req.on('error', (error) => {
            console.error('Error:', error);
        });
        req.end();
    });
}

function answerQuestion(jsessionId, idAnswer, signature) {
    return new Promise((resolve, reject) => {
        const path = "/siette/generador/Respuesta;jsessionid=" + jsessionId + '?idrespuesta0=' + idAnswer;
        const options = {
            hostname: 'www.siette.org',
            path: path,
            method: 'GET',
            headers: {
            'Cookie': 'siette.user=' + signature,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.93 Safari/537.36'
            }
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                console.log('Response:', data);
                parser.parseString(data, (err, result) => {
                    if (err) {
                        console.error('Error parsing XML:', err);
                        reject();
                    } else {
                        resolve(result);
                    }
                });
            });
        });
        req.on('error', (error) => {
            console.error('Error:', error);
        });
        req.end();
    });
}

module.exports = {
    hasExpiredSession,
    beginTestSession,
    createTestSession,
    startTestSession,
    getNextQuestion,
    answerQuestion,
    getAnswerResult
}

