/**
 * @file Main file for Mosaic Screen! Your friendly neopixel screen controller
 */
const { createCanvas, loadImage } = require('canvas')
const SerialPort = require('serialport');
const { exec } = require('child_process');
const options = {
  port: '/dev/ttyACM0',
  baudRate: 115200,
};

const END_FRAME = 255;
const FRAME_RATE = 60; // In Frame updates per second
const width = 15;
const height = 15;
const serverPort = 80;
const canvas = createCanvas(width, height);
const ctx = canvas.getContext('2d', { antialias: 'none' })
ctx.antial
const appData = {
  images: {
    heart: { fps: 3 },
    bird: { fps: 6 },
    eye: { fps: 10 },
    flower: { fps: 2 },
    rainbow: { fps: 24 },
    fire: { fps: 8 },
    pumpkin: { fps: 8 },
    skeleton: { fps: 8 },
    pickaxe: { fps: 5 },
    nyan: { fps: 5 },
  },
};


// Server stuff
const express = require('express');
const http = require('http');
const app = express();
const httpServer = http.createServer(app);

httpServer.listen(
  serverPort,
  null,
  () => {
    // Properly close down server on fail/close
    process.on('SIGTERM', (err) => {
      httpServer.close();
    });
  }
);
app.use('/', express.static('./interface/'));

const nm = `./node_modules`;
app.use('/bulma', express.static(`${nm}/bulma/css/`));
app.use('/jquery', express.static(`${nm}/jquery/dist/`));
app.use('/axios', express.static(`${nm}/axios/dist/`));
app.use('/images', express.static(`./images/`));
app.use(express.json());

// Setup single I/O endpoint
app.get('/data', (req, res) => {
  res.set('Content-Type', 'application/json; charset=UTF-8');
  res.send(appData);
});


// CONTROL API: ===============================================================
let currentInterval = null;
app.post('/data', (req, res) => {
  const change = req.body;
  // Debug!:
  // console.log('Got request:', change);

  // Stop and clear all.
  if (change.stop) {
    clearInterval(currentInterval);
    clearScreen();
  }

  // Set an animated image
  if (change.image) {
    clearInterval(currentInterval);
    animImage(change.image).then((interval) => {
      currentInterval = interval;
    });
  }

  // Bounce the ball
  if (change.ball) {
    clearInterval(currentInterval);
    currentInterval = ballBounce(change.ball);
  }

  // Scroll text!
  if (change.scroll) {
    clearInterval(currentInterval);
    currentInterval = scrollText(change.scroll);
  }

  // Shut down/restart!
  if (change.power) {
    clearInterval(currentInterval);
    currentInterval = hostPower(change.power);
  }

  res.send({status: 'ok'});
});

// Add custom scrolling text from left to right.
function scrollText({ color = 'blue', text, size = '8', font = 'Arial', speed = 2 }) {
  ctx.fillStyle = color;
  ctx.font = `${size}px ${font}`;
  text = text.split('').join(String.fromCharCode(8202));
  const textSize = ctx.measureText(text);

  // Buffer off the right of the text, gives screen a break, in pixels.
  const buffer = 10;

  // Start at right side.
  let x = width;

  // Center height.
  let y = 10;
  return setInterval(() => {
    x = x - speed / 5; // Move to the left.

    clearScreen();
    ctx.fillText(text, Math.floor(x), y);

    if (x < -(textSize.width + buffer)) {
      x = width;
    }

  }, Math.round(1000 / 30));
}

// Bounce a ball around the screen.
function ballBounce(color) {
  var p = { x: 5, y: 5 };
  var velo = 0.1,
      corner = 50,
      rad = 1;
  var ball = { x: p.x, y: p.y };
  var moveX = Math.cos(Math.PI / 180 * corner) * velo;
  var moveY = Math.sin(Math.PI / 180 * corner) * velo;

  function DrawMe() {
      clearScreen();

      if (ball.x > canvas.width - rad || ball.x < rad) moveX = -moveX;
      if (ball.y > canvas.height - rad || ball.y < rad) moveY = -moveY;

      ball.x += moveX;
      ball.y += moveY;

      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(ball.x, ball.y, rad, 0, Math.PI * 2, false);
      ctx.fill();
      ctx.closePath();
  }
  return setInterval(DrawMe, 10);
}

// Clear the screen.
function clearScreen() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// Animate a horizontal sprite sheet image over 15px square.
function animImage(name) {
  if (!appData.images[name]) {
    name = 'fire';
  }

  const { fps } = appData.images[name];

  return new Promise((done) => {
    loadImage(`./images/${name}.gif`).then((image) => {
      const frames = image.width / width;
      let frame = 0;
      const interval = setInterval(() => {
        if (frame == frames) {
          frame = 0;
        }

        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, frame * 15, 0, 15, 15, 0, 0, 15, 15);
        frame++;
      }, Math.round(1000 / fps));
      done(interval);
    });
  });
}

// Raspberry pi shutdown/restart
function hostPower(option) {
  let countdown = 5 + 4;
  // Safety measure: unless we're running as root, these will just fail.
  const cmd = option === 'shutdown' ? '/sbin/shutdown -h now' : '/sbin/reboot';

  return setInterval(() => {
    clearScreen();
    if (countdown > 5) {
      if (countdown % 2) {
        ctx.fillStyle = 'red';
        ctx.lineWidth = 0.5;
        ctx.strokeStyle = 'red';
        ctx.fillRect(6, 7, 2, 7);
        ctx.beginPath();
        ctx.arc(7, 7, 6, 0, Math.PI * 2, true);
        ctx.stroke();
      }
    } else if (countdown > -1) {
      // Show the countdown.
      ctx.font = `15px Impact`;
      ctx.fillText(countdown, 3, 13);
    } else if (countdown === -1) {
      // Clear the screen, wait one sec...
      clearScreen();
    } else if (countdown === -2) {
      // Actually run the command.
      exec(cmd);
    }

    countdown--;
  }, 1000);
}


function getFrameData() {
  // Get RGBA array of data
  const imageData = ctx.getImageData(0, 0, width, height).data;
  const bytes = [];
  const rowWidth = width * 4;
  for (let index = 0; index < width * height * 4; index = index + 4) {
    let offset = index;
    let row = Math.floor((index / 4) / width);

    // Even rows need to be read backwards
    if (row & 1) {
      const rowStart = (rowWidth * row);
      const rowEnd = rowStart + rowWidth;
      offset = rowStart + (rowEnd - index - 4);
    }

    bytes.push(rgbToByte([
      imageData[offset],
      imageData[offset + 1],
      imageData[offset + 2],
    ]));

    // TODO: Reverse index on even fields for "snake" pattern.
  }
  bytes.push(END_FRAME);
  return bytes;
}

function rgbToByte([r, g, b]) {
  const byte = (Math.floor((r / 32)) << 5) + (Math.floor((g / 32)) << 2) + Math.floor((b / 64));
  // return the byte, reserving the highest bit for frame marking.
  return byte === 255 ? 254 : byte;
}

function sendFrame(port) {
  //console.time('send');
  const buffer = new Buffer.from(getFrameData());

  port.write(buffer, () => {
    //console.timeEnd('send');
    setTimeout(() => {
      sendFrame(port);
    }, Math.round(1000 / FRAME_RATE));
  });
}

try {
  port = new SerialPort(options.port, options, (err) => {
    if (!err) {
      console.log('Connected!');

      sendFrame(port);

      // Start an animation to show it works.
      currentInterval = ballBounce('white');

      port.on('close', (err) => {
        console.error('Closed!', err);
        process.exit(1);
      });
    } else {
      console.error(err);
      process.exit(1);
    }
  });
} catch (err) {
  console.error(err);
  process.exit(1);
}
