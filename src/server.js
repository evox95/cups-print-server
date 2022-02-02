const ipp = require('ipp');
const request = require('request');
const fs = require('fs');
const express = require('express')
const bodyParser = require('body-parser');
const cors = require('cors');

require('dotenv').config();
const APP_PORT = process.env.APP_PORT || 3000;
const SSL_ENABLE = process.env.SSL_ENABLE || false;
const SSL_KEY = process.env.SSL_KEY || null;
const SSL_CERT = process.env.SSL_CERT || null;
const CUPS_HOST = process.env.CUPS_HOST || '127.0.0.1';
const CUPS_PORT = process.env.CUPS_PORT || 631;

const app = express()
app.use(cors());
app.use(bodyParser.urlencoded({limit: '100mb', extended: true}));
app.use(bodyParser.raw());

// noinspection HttpUrlsUsage
const CUPS_URL = `http://${CUPS_HOST}:${CUPS_PORT}/printers/`;

/**
 * Get list of available printers
 *
 * @param callback{function(ErrnoException|null, string[])}
 */
const getPrinterNames = (callback) => {
    request(CUPS_URL, (error, response, body) => {
        let printerNames = [];
        if (!error && response.statusCode === 200) {
            const printersMatches = body.match(/<A HREF="\/printers\/([^"]+)">/gm);
            let i;
            if (printersMatches) {
                for (i = 0; i < printersMatches.length; i++) {
                    const a = (/"\/printers\/([^"]+)"/).exec(printersMatches[i]);
                    if (a) {
                        printerNames.push(a[1]);
                    }
                }
            }
        }
        callback(error, printerNames);
    });
}

/**
 * Get printer object by printer name
 *
 * @param printerName{string}
 * @returns {Printer}
 */
const getPrinter = (printerName) => {
    return ipp.Printer(CUPS_URL + printerName, {});
}

/**
 * Print from buffer
 *
 * @param printer{Printer}
 * @param bufferToBePrinted{Buffer}
 * @param bufferFormat{string}
 * @param orientation{"landscape"|"portrait"|"reverse-landscape"|"reverse-portrait"}
 */
const print = (
    printer,
    bufferToBePrinted,
    bufferFormat = 'text/plain',
    orientation = 'landscape'
) => {
    printer.execute("Get-Printer-Attributes", null, (err, response) => {
        if (err) throw err;

        if (
            typeof response['printer-attributes-tag'] === 'undefined'
            || typeof response['printer-attributes-tag']['printer-state'] === 'undefined'
            || response['printer-attributes-tag']['printer-state'] !== 'idle'
        ) {
            console.log(response);
            throw new Error('Printer is not ready!');
        }

        console.log("Printer ready, printing...");

        // https://datatracker.ietf.org/doc/html/rfc2911#section-4.2.10
        const ORIENTATION = {
            "portrait": 3,
            "landscape": 4,
            "reverse-landscape": 5,
            "reverse-portrait": 6,
        }

        const jobOptions = {
            "operation-attributes-tag": {
                "requesting-user-name": "nap",
                "document-format": bufferFormat,
            },
            // https://datatracker.ietf.org/doc/html/rfc2911#section-4.2
            "job-attributes-tag": {},
            "data": bufferToBePrinted
        }
        if (typeof ORIENTATION[orientation] !== 'undefined') {
            jobOptions["job-attributes-tag"] = {
                "orientation-requested": ORIENTATION[orientation],
            }
        }
        console.log(jobOptions);

        printer.execute(
            "Print-Job",
            jobOptions,
            (err, res) => {
                if (err) throw err;
                console.log(res);

                if (res.statusCode !== 'successful-ok') {
                    throw new Error('Error sending job to printer!');
                }

                let jobUri = res['job-attributes-tag']['job-uri'];
                let waitingTimeSec = 30;
                let checkResponseIntervalSec = 2;
                let waitingForResponseInterval = setInterval(() => {
                    console.log("Waiting for response from printer... " + waitingTimeSec + "s");
                    printer.execute(
                        "Get-Job-Attributes",
                        {"operation-attributes-tag": {'job-uri': jobUri}},
                        (err, job) => {
                            if (err) throw err;
                            console.log(job);

                            if (job && job["job-attributes-tag"]["job-state"] === 'completed') {
                                clearInterval(waitingForResponseInterval);
                                console.log('Print success. Job parameters:');
                                console.log(job);
                                return;
                            }

                            if (job && job["job-attributes-tag"]["job-state"] === 'processing-stopped') {
                                clearInterval(waitingForResponseInterval);
                                console.log('Print failed. Job parameters:');
                                console.log(job);
                                throw new Error(job["job-attributes-tag"]["job-printer-state-message"]);
                            }

                            waitingTimeSec -= checkResponseIntervalSec;
                            if (waitingTimeSec > 0) {
                                return;
                            }

                            clearInterval(waitingForResponseInterval);
                            printer.execute(
                                "Cancel-Job",
                                {
                                    "operation-attributes-tag": {
                                        // "job-uri": jobUri, //uncomment this
                                        // or uncomment this two lines below - one of variants should work!
                                        "printer-uri": printer.uri,
                                        "job-id": job["job-attributes-tag"]["job-id"]
                                    }
                                },
                                (err, res) => {
                                    if (err) throw err;
                                    console.log('Job with id ' + job["job-attributes-tag"]["job-id"] + ' is being canceled');
                                }
                            );
                            throw new Error('Job cancelled - failed to print!');
                        }
                    );
                }, checkResponseIntervalSec * 1000);
            }
        );
    });
}

// /test
// /test?printer={printer-name}
app.get('/test', (req, res) => {
    res.send({success: true});

    fs.readFile('print_test.txt', (err, buffer) => {
        if (err) {
            console.error("Failed to read file print_test.txt");
            throw err;
        }

        if (!req.query.printer) {
            getPrinterNames((err, printerNames) => {
                if (err) throw err;

                const printer = getPrinter(printerNames[0]);
                print(printer, buffer, 'text/plain');
            })
        } else {
            const printer = getPrinter(req.query.printer);
            print(printer, buffer, 'text/plain');
        }
    });
})

// /print-document?printer=DYMO_LW_4XL
// /print-document?printer={printer-name}&orientation={"landscape"|"portrait"|"reverse-landscape"|"reverse-portrait"}
app.post('/print-document', async (req, res) => {
    try {
        if (!req.body) {
            res.send({
                status: false,
                success: 'No file uploaded'
            });
        } else if (!req.query.printer) {
            res.send({
                success: false,
                message: 'No printer selected'
            });
        } else {
            const buffer = Buffer.from(req.body.toString(), "binary");
            const printer = getPrinter(req.query.printer);
            print(printer, buffer, 'application/pdf', req.query.orientation);
            res.send({success: true});
        }
    } catch (err) {
        console.log(err);
        res.status(500).send(err.toString());
    }
})

let server = app;
if (SSL_ENABLE) {
    server = require('https').createServer({
        key: fs.readFileSync(SSL_KEY),
        cert: fs.readFileSync(SSL_CERT),
    }, app);
    console.log('SSL support enabled')
}
server.listen(APP_PORT, () => {
    console.log(`CUPS printing server app is listening on port ${APP_PORT}`)
})