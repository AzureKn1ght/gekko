// required indicators
var MACD = require('./MACD');
var BBANDS = require('./BBANDS');
var ATR = require('./ATR');

var Indicator = function (config)
{
  this.input = 'candle';
  this.settings = config;
  this.sensitivity = this.settings.WAE.sensitivity;
  this.result = 'NONE';

  //trend variables
  this.prices = [];
  this.trend = [];
  this.explosion = [];
  this.risingExplosion = false;
  this.risingHistogram = false;
  this.histogram = 0;
  this.explosionLevel = 0;
  this.deadzone = 0;
  this.age = 0;

  //initialize the required MACDs
  this.MACD1 = new MACD(this.settings.MACD);
  this.MACD2 = new MACD(this.settings.MACD);

  //initialize the BBands
  this.BB = new BBANDS(this.settings.BB);

  //initialize the ATR indicator
  this.ATR = new ATR(this.settings.WAE.deadzoneRange);
  this.deadzoneMultiple = this.settings.WAE.deadzoneMultiple
}

Indicator.prototype.update = function (candle)
{
  //update the BB
  this.BB.update(candle.close);

  //update the ATR
  this.ATR.update(candle);

  //update the closing price array
  this.prices[this.age] = candle.close;

  //update MACD: need to check enough periods
  if (this.prices.length < 2)
  {
    this.MACD1.update(this.prices[this.age]);
  }
  else
  {
    this.MACD1.update(this.prices[this.age]);
    this.MACD2.update(this.prices[this.age - 1]);
  }

  //calculate Deadzone
  this.deadzone = this.ATR.result * this.deadzoneMultiple;

  //calculate MACD trend
  this.trend[this.age] = (this.MACD1.result - this.MACD2.result) * this.sensitivity;
  this.histogram = this.trend[this.age];

  //calculate Explosion level
  this.explosion[this.age] = this.BB.upper - this.BB.lower;
  this.explosionLevel = this.explosion[this.age];

  //logic to generate BUY/SELL signals
  let exp = (Math.abs(this.histogram) > this.deadzone && Math.abs(this.histogram) > this.explosionLevel) || false;
  this.risingExplosion = (this.explosion[this.age] > this.explosion[this.age - 1]) || false;
  this.risingHistogram = (Math.abs(this.trend[this.age]) > Math.abs(this.explosion[this.age - 1])) || false;


  if (this.histogram > 0 && exp)
  {
    //BUY confirmation signal
    this.result = "BUY"; 
  }
  else if (this.histogram < 0 && exp)
  {
    //SELL signal to short
    this.result = "SELL"; 
  }
  else
  {
    //no trend change, hold positions
    this.result = "NONE"; 
  }

  this.age++;
}

module.exports = Indicator;