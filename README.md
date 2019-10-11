# mosaic-screen
A single day hack app to stream at ~30-60fps to a Adafruit Neopixel display

Yup, just like it says. Made this with my son Dorian in a day or so. Code
quality is terrible, but very performant.

Arduino interfaces directly with the Neopixel strip, and simply reads bytes in
and sets values in order. Here's the Arduino code (though I'm running it on a
Teensy, still works great):

```c++
// Simple byte based linear stream for FAST 256* color display.
#include <Adafruit_NeoPixel.h>
#ifdef __AVR__
 #include <avr/power.h> // Required for 16 MHz Adafruit Trinket
#endif

// Which pin on the Arduino is connected to the NeoPixels?
#define LED_PIN    0

// How many NeoPixels are attached to the Arduino?
#define LED_COUNT 225

int pixel = 0;
int counter = 0;
int bright = 125;

// Declare our NeoPixel strip object:
Adafruit_NeoPixel strip(LED_COUNT, LED_PIN, NEO_GRB + NEO_KHZ800);

// setup() function -- runs once at startup --------------------------------
void setup() {
  // These lines are specifically to support the Adafruit Trinket 5V 16 MHz.
  // Any other board, you can remove this part (but no harm leaving it):
#if defined(__AVR_ATtiny85__) && (F_CPU == 16000000)
  clock_prescale_set(clock_div_1);
#endif
  // END of Trinket-specific code.
  Serial.begin(115200);
  strip.begin();           // INITIALIZE NeoPixel strip object (REQUIRED)
  strip.show();            // Turn OFF all pixels ASAP
  strip.setBrightness(bright); // Set BRIGHTNESS
}


// loop() function -- runs repeatedly as long as board is on ---------------

void loop() {
  // 1. Read a byte through the serial port
  // 2. If it's a trigger byte, run strip show and reset counter
  // 3. Otherwise, read what color the byte is, and set the counter pixel
  while (Serial.available()) {
    pixel = Serial.read();
    if (pixel == 255) {
      // New frame! Display the last one, reset counter.
      strip.show();
      counter = 0;
    } else {
      uint32_t color = strip.Color((pixel >> 5) * 32, ((pixel & 28) >> 2) * 32, (pixel & 3) * 64, bright);
      strip.setPixelColor(counter, color);
      counter++;

      // Sane byte overflow protection.
      if (counter > strip.numPixels() - 1) {
        counter = 0;
      }
    }
  }
}
```
