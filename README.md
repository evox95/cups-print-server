CUPS print server
---

A simple nodejs server that receives a file sent with a POST request and then sends it to CUPS for printing. This can be run, for example, on a RaspberryPi, to which we have a printer connected and CUPS running.

## Requirements

* [Node.js](https://nodejs.org/en/download/) v10.0 or higher is required

## Usage

1. (optionally) Create file `.env` with your values
```
APP_PORT = 3000
CUPS_HOST = 127.0.0.1
CUPS_PORT = 3000
```
2. Run `npm install`
3. Start server by `npm run start`

## License

See [LICENSE](LICENSE).