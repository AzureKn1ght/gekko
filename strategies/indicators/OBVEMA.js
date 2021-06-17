// required indicators
var EMA = require('./EMA.js');

var Indicator = function (length)
{
  this.input = 'candle';
  this.result = 0;
  this.OBV = 0;
  this.lastClose = 0;
  this.ema = new EMA(length);
}

Indicator.prototype.update = function (candle)
{
  //Calculate the OBV
  this.calculate(candle);

  //Update the EMA based on OBV
  this.ema.update(this.OBV);
  this.result = this.ema.result;

  return this.result;
}

Indicator.prototype.calculate = function (candle)
{
  let currentClose = candle.close;

  if (currentClose > this.lastClose)
  {
    this.OBV += candle.volume;
  }
  else if (currentClose < this.lastClose)
  {
    this.OBV -= candle.volume;
  }

  this.lastClose = currentClose;
}


module.exports = Indicator;