/**
 * @file Main file for Mosaic Screen! Your friendly neopixel screen controller
 */
const { createCanvas, loadImage } = require('canvas')
const SerialPort = require('serialport');
let port; // Serial port object after init
const socketio = require('socket.io');
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
const io = socketio(httpServer);
// SOCKET DATA STREAM ========================================================
io.on('connection', (socket) => {
  socket.on('end', () => {
    startSyncCanvas();
  });

  socket.on('frame', (data) => {
    stopSyncCanvas();
    sendFrame(data);
  });

  socket.on('disconnect', () => {
    startSyncCanvas();
  });
});



// CONTROL API: ===============================================================
let currentInterval = null; // Interval for the currently running mode
let rotationModeInterval = null; // Interval within the rotation mode
function changeScreen(change) {
  // Debug!:
  // console.log('Got request:', change);

  // Run the screen promise, then reset the current global interval.
  runScreen(change).then((interval) => {
    clearInterval(currentInterval);
    if (!change.rotate) clearInterval(rotationModeInterval);
    currentInterval = interval;
  });
}

// Handler for running a change, returns a promise that resolves the interval.
function runScreen(change) {
  return new Promise((done, fail) => {
    // Stop and clear all.
    if (change.stop) {
      clearScreen();
      done(null);
    } else if (change.image) {
      // Set an animated image
      animImage(change.image).then(done);
    } else if (change.ball) {
      // Bounce the ball
      done(ballBounce(change.ball));
    } else if (change.scroll) {
      // Scroll text!
      done(scrollText(change.scroll));
    } else if (change.plasma) {
      // Magic rainbow plasma
      done(plasma());
    } else if (change.power) {
      // Shut down/restart!
      done(hostPower(change.power));
    } else if (change.rotate) {
      // Rotate through
      done(rotateModes(change.rotate));
    } else {
      fail();
    }
  });
}

// Get a random number excluding one.
const getRand = (max, exclude) => {
  let picked = exclude;
  while (picked == exclude) {
    picked = Math.floor(Math.random() * max);
  }
  return picked;
};

// Rotation mode.
function rotateModes(seconds) {
  let lastPick = null;
  const options = [
    { image: 'heart' }, { image: 'bird' }, { image: 'eye' }, { image: 'flower' },
    { image: 'fire' }, { image: 'pumpkin' }, { image: 'skeleton' },
    { image: 'pickaxe' }, { image: 'nyan' },

    { plasma: true }, { plasma: true }, { plasma: true }, { plasma: true },
  ];

  const pickNext = () => {
    const pick = getRand(options.length, lastPick);
    lastPick = pick;

    clearInterval(rotationModeInterval);
    runScreen(options[pick]).then((interval) => {
      rotationModeInterval = interval;
    });
  };

  pickNext();
  return setInterval(pickNext, seconds * 1000);
}


// Add custom scrolling text from left to right.
function scrollText({ color = 'blue', text, size = '9', font = 'Arial', speed = 2 }) {
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

// Run the random plasma animation at 60fps.
function plasma() {
  var w = canvas.width;
  var h = canvas.height;

  var buffer = new Array(h);

  const mod = [
    Math.random() * 64,
    Math.random() * 64,
    Math.random() * 64,
  ];

  for (var y = 0; y < h; y++) {
    buffer[y] = new Array(w);
    for (var x = 0; x < w; x++) {
      var value = Math.sin(x / 16.0 / mod[0]);
      value += Math.sin(y / 8.0 / mod[1]);
      value += Math.sin((x + y) / 16.0 / mod[0]);
      value += Math.sin(Math.sqrt(x * x + y * y) / 8.0 / mod[1]);
      value += 4 / mod[2]; // shift range from -4 .. 4 to 0 .. 8
      value /= 8 / mod[2]; // bring range down to 0 .. 1
      buffer[y][x] = value;
    }
  }

  var plasma = buffer;
  var hueShift = 0;

  return setInterval(() => {
    var img = ctx.getImageData(0, 0, w, h);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var hue = hueShift + plasma[y][x] % 1;
        var rgb = HSVtoRGB(hue, plasma[y][x], plasma[y][x]);
        var pos = (y * w + x) * 4;
        img.data[pos] = rgb.r;
        img.data[pos + 1] = rgb.g;
        img.data[pos + 2] = rgb.b;
        img.data[pos + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    hueShift = (hueShift + 0.01) % 1;
  }, Math.round(1000 / 60));
}

// Convert Hue, Saturation, & Brightness to Red, Green, & Blue
function HSVtoRGB(h, s, v) {
  var r, g, b, i, f, p, q, t;

  i = Math.floor(h * 6);
  f = h * 6 - i;
  p = v * (1 - s);
  q = v * (1 - f * s);
  t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: r = v, g = t, b = p; break;
    case 1: r = q, g = v, b = p; break;
    case 2: r = p, g = v, b = t; break;
    case 3: r = p, g = q, b = v; break;
    case 4: r = t, g = p, b = v; break;
    case 5: r = v, g = p, b = q; break;
  }
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  };
}

// =============================================================================
// =============== Init Serial connection and frame sending ====================
// =============================================================================

// Weave through all pixels on the canvas and generate a byte array for writing.
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
  }
  bytes.push(END_FRAME);
  return bytes;
}

// Flatten any RGB byte triplet into a single 255 color byte.
function rgbToByte([r, g, b]) {
  const byte = (Math.floor((r / 32)) << 5) + (Math.floor((g / 32)) << 2) + Math.floor((b / 64));
  // return the byte, reserving the highest bit for frame marking.
  return byte === 255 ? 254 : byte;
}

// Write the a scanline buffer from canvas to the serialport.
function sendFrame(externalData) {
  const buffer = new Buffer.from(externalData || getFrameData());
  port.write(buffer);
}

let syncCanvasInterval = null;
function startSyncCanvas() {
  syncCanvasInterval = setInterval(() => {
    sendFrame();
  }, Math.round(1000 / FRAME_RATE));
}

function stopSyncCanvas() {
  clearInterval(syncCanvasInterval);
}

// Try to connect to the serial port and begin writing frames.
try {
  port = new SerialPort(options.port, options, (err) => {
    if (!err) {
      console.log('Connected!');

      startSyncCanvas();

      // Start an animation to show it's on.
      changeScreen({ ball: 'white' });

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

// =============================================================================
// ======================== Setup Server Endpoint ==============================
// =============================================================================
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

app.post('/data', (req, res) => {
  const change = changeScreen(req.body);
  res.send({status: 'ok'});
});
