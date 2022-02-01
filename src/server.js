const ipp = require('ipp');
const request = require('request');
const fs = require('fs');
const express = require('express')

const app = express()
const port = 621

const CUPS_URL = 'http://localhost:631/printers/';

/**
 * Get list of available printers
 *
 * @param callback{function}
 */
const getPrinterUrls = (callback) => {
    request(CUPS_URL, (error, response, body) => {
        let printerUrls = [];
        if (!error && response.statusCode === 200) {
            const printersMatches = body.match(/<A HREF="\/printers\/([^"]+)">/gm);
            let i;
            if (printersMatches) {
                for (i = 0; i < printersMatches.length; i++) {
                    const a = (/"\/printers\/([^"]+)"/).exec(printersMatches[i]);
                    if (a) {
                        printerUrls.push(CUPS_URL + '/' + a[1]);
                    }
                }
            }
        }
        callback(error, printerUrls);
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
 */
const print = (printer, bufferToBePrinted, bufferFormat = 'text/plain') => {
    printer.execute("Get-Printer-Attributes", null, (err, response) => {
        if (err) throw new Error(err);

        if (
            typeof response['printer-attributes-tag'] === 'undefined'
            || typeof response['printer-attributes-tag']['printer-state'] === 'undefined'
            || response['printer-attributes-tag']['printer-state'] !== 'idle'
        ) {
            console.log(response);
            throw new Error('Printer is not ready!');
        }

        console.log("Printer ready, printing...");
        printer.execute(
            "Print-Job",
            {
                "operation-attributes-tag": {
                    "requesting-user-name": "nap",
                    // "job-name": "testing",
                    "document-format": bufferFormat,
                },
                "job-attributes-tag": {},
                data: bufferToBePrinted
            },
            (err, res) => {
                if (err) throw new Error(err);
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
                            if (err) throw new Error(err);
                            console.log(job);

                            if (job && job["job-attributes-tag"]["job-state"] === 'completed') {
                                clearInterval(waitingForResponseInterval);
                                console.log('Print success. Job parameters:');
                                console.log(job);
                                return;
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
                                    if (err) throw new Error(err);
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

app.get('/test', (req, res) => {
    res.send('testing...');

    fs.readFile('print_test.pdf', (err, buffer) => {
        if (err) {
            console.error("Failed to read file print_test.pdf");
            return;
        }

        const printer = getPrinter('DYMO_LW_4XL');
        // const buffer = new Buffer(data, 'binary');
        print(printer, buffer, "application/pdf")
    });
})

app.listen(port, () => {
    console.log(`CUPS printing server app is listening on port ${port}`)
})