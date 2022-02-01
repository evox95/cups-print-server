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
 */
const print = (printer, bufferToBePrinted) => {
    printer.execute("Get-Printer-Attributes", null, (err, printerStatus) => {
        if (err) throw new Error(err);
        console.log(printerStatus);

        if (printerStatus.statusCode !== 'idle') {
            throw new Error('Printer is not ready!');
        }

        printer.execute("Print-Job",
            {
                "operation-attributes-tag": {
                    "requesting-user-name": "nap",
                    "job-name": "testing"
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
                let tries = 0;
                let t = setInterval(() => {
                    printer.execute(
                        "Get-Job-Attributes",
                        {"operation-attributes-tag": {'job-uri': jobUri}},
                        (err, job) => {
                            if (err) throw new Error(err);
                            console.log(job);

                            if (job && job["job-attributes-tag"]["job-state"] === 'completed') {
                                clearInterval(t);
                                console.log('Print success. Job parameters:');
                                console.log(job);
                                return;
                            }

                            if (tries++ > 10) {
                                clearInterval(t);
                                printer.execute("Cancel-Job", {
                                    "operation-attributes-tag": {
                                        //"job-uri":jobUri,  //uncomment this
                                        "printer-uri": printer.uri, //or uncomment this two lines - one of variants should work!!!
                                        "job-id": job["job-attributes-tag"]["job-id"]
                                    }
                                }, (err, res) => {
                                    if (err) throw new Error(err);
                                    console.log('Job with id ' + job["job-attributes-tag"]["job-id"] + ' is being canceled');
                                });

                                throw new Error('Job is canceled - too many tries and job is not printed!');
                            }
                        }
                    );
                }, 2000);
            });
    });
}

app.get('/test', (req, res) => {
    res.send('testing...');

    fs.readFile('print_test.txt',  (err, buffer) => {
        if (err) {
            console.error("Failed to read file print_test.txt");
            return;
        }

        const printer = getPrinter('DYMO_LW_4XL');
        // const buffer = new Buffer(data, 'binary');
        print(printer, buffer)
    });
})

app.listen(port, () => {
    console.log(`CUPS printing server app is listening on port ${port}`)
})