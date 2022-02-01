// const ipp = require('ipp');
const request = require('request');
// const fs = require('fs');
const express = require('express')
const app = express()
const port = 621

const getPrinterUrls = (callback) => {
    const cups_url = 'http://localhost:631/printers';
    request(cups_url, function (error, response, body) {
        if (!error && response.statusCode === 200) {
            const printersMatches = body.match(/<TR><TD><A HREF="\/printers\/([a-zA-Z0-9-^"]+)">/gm);
            let printers = [];
            let i;
            if (printersMatches) {
                for (i = 0; i < printersMatches.length; i++) {
                    const a = (/"\/printers\/([a-zA-Z0-9-^"]+)"/).exec(printersMatches[i]);
                    if (a) {
                        printers.push(cups_url + '/' + a[1]);
                    }
                }
            }
        }
        // console.log(error, response, body);
        console.log(body);
        callback(error, printers);
    });
};

let error, printers;
getPrinterUrls((_error, _printers)=>{
    error = _error;
    printers = _printers;
});

app.get('/', (req, res) => {
    console.log(error);
    console.log(printers);
    res.send('hello!');
})

app.listen(port, () => {
    console.log(`CUPS printing server app is listening on port ${port}`)
})