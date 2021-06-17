var _ = require('lodash');

var Indicator = function (config)
{
  this.input = 'candle';
  this.length = config.length;
  this.trigLen = config.trigger;

  this.value = 0;
  this.result = 0;
  this.hl2history = [];

  //fisher results
  this.fishArr = [];
  this.fisher = 0;
  this.trigger = Infinity;
  this.age = 0;
}

Indicator.prototype.update = function (candle)
{
  //calculating the values
  let hl2 = (candle.high + candle.low) / 2;
  this.hl2history.push(hl2);
  if (_.size(this.hl2history) > this.length)
    this.hl2history.shift();
  let low = _.min(this.hl2history);
  let high = _.max(this.hl2history);
  this.value = this.round(.66 * ((hl2 - low) / Math.max(high - low, .001) - .5) + .67 * this.value);
  this.result = .5 * Math.log((1 + this.value) / Math.max(1 - this.value, .001)) + .5 * this.result;

  //store the fisher result into array
  this.fishArr[this.age] = this.result;

  //check whether enough history for trigger
  if (this.age >= this.trigLen)
  {
    this.fisher = this.fishArr[this.age];
    this.trigger = this.fishArr[this.age - this.trigLen];
  }

  this.age++;
}

//helper function
Indicator.prototype.round = function (value)
{
  return value > .99 ? .999 : value < -.99 ? -.999 : value;
}

module.exports = Indicator;
