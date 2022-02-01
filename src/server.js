const ipp = require('ipp');
const request = require('request');
const fs = require('fs');
const express = require('express')

const app = express()
const port = 621

const CUPS_URL = 'http://localhost:631/printers/';

const getPrinterUrls = (callback) => {
    request(CUPS_URL, function (error, response, body) {
        if (!error && response.statusCode === 200) {
            const printersMatches = body.match(/<A HREF="\/printers\/([^"]+)">/gm);
            let printerUrls = [];
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

const getPrinter = (printerName) => {
    return ipp.Printer(CUPS_URL + printerName, {});
}

const print = (printer, bufferToBePrinted, callback) => {
    printer.execute("Get-Printer-Attributes", null, function (err, printerStatus) {
        console.log(printerStatus);
        if (printerStatus.statusCode !== 'idle') {
            callback(
                new Error('Printer is not ready!'),
                null
            );
            return;
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
            function (err, res) {
                if (res.statusCode !== 'successful-ok') {
                    callback(new Error('Error sending job to printer!'), null);
                    return;
                }

                let jobUri = res['job-attributes-tag']['job-uri'];
                let tries = 0;
                let t = setInterval(function () {
                    printer.execute("Get-Job-Attributes",
                        {"operation-attributes-tag": {'job-uri': jobUri}},
                        function (err2, job) {
//                            console.log(job);
                            if (err2) throw err2;
                            tries++;
                            if (job && job["job-attributes-tag"]["job-state"] === 'completed') {
                                clearInterval(t);
//                                console.log('Testing if job is ready. Try N '+tries);
                                callback(null, job);//job is successfully printed!
                            }
                            if (tries > 50) {//todo - change it to what you need!
                                clearInterval(t);
                                printer.execute("Cancel-Job", {
                                    "operation-attributes-tag": {
                                        //"job-uri":jobUri,  //uncomment this
                                        "printer-uri": printer.uri, //or uncomment this two lines - one of variants should work!!!
                                        "job-id": job["job-attributes-tag"]["job-id"]
                                    }
                                }, function (err, res) {
                                    if (err) throw err;
                                    console.log('Job with id ' + job["job-attributes-tag"]["job-id"] + 'is being canceled');
                                });

                                callback(new Error('Job is canceled - too many tries and job is not printed!'), null);
                            }
                        });
                }, 2000);
            });
    });
}

app.get('/test', (req, res) => {
    res.send('testing...');

    fs.readFile('print_test.txt', function (err, buffer) {
        if (err) {
            console.error("Failed to read file print_test.txt");
            return;
        }

        const printer = getPrinter('DYMO_LW_4XL');
        // const buffer = new Buffer(data, 'binary');
        print(printer, buffer, function (err, job) {
            if (err) {
                console.error('Failed to print, details below:');
                console.error(err);
            } else {
                console.log('Print success. Job parameters are:');
                console.log(job);
            }
        })
    });
})

app.listen(port, () => {
    console.log(`CUPS printing server app is listening on port ${port}`)
})