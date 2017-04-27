# Raspberry Pi Virtualization Server API

## Installation

First, follow the README.md to prepare system

### Install additional Node.js modules

We assume that server.js script is located in /home/ubuntu/raspberry_virtualization

```
cd /home/ubuntu/raspberry_virtualization
npm install nodemon express body-parser ps-node linux-mountutils mkdirp

```

## Usage
### How to launch
In order to run script in development mode, move to script folder and run

```
sudo npm run dev
```

In this mode, server is being automatically relaunched every time you modify and file in folder

Alternatively, you can just invoke:
```
sudo node /path/to/script/server.js
```

### Working with API

Server listens on 8000 by default. It accepts POST and DELETE methods at /container path and waits for x-www-form-urlencode json message in the following format:
```
{ name: 'containername' }
```
for example:
{ name: 'test1' }




