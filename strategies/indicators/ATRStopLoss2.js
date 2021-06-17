/* UPDATED ON 07/01/2020
Based on: Cracking Cryptocurrency - Quadrigo Average True Range
Quadrigo ATR can be set to any source to analyze price data.
Take Profit Levels and Stop Loss Levels are calculated based on multiples of ATR.
Default Values are Stop Loss = 1.5x ATR.
Take Profit 1 = 1x ATR. (Take 50 % Profit and move stop - loss to break even at this level, or set a Trailing Stop Loss(TSL))
Take Profit 2 = 2x ATR. (Take 30 % Profit and move stop - loss to Take Profit 1 at this level, or set a TSL)
Take Profit 3 = 3x ATR. (Exit Trade, or set a TSL with a value equal to Take Profit 2 at this level.)
*/

var ATR = require('./ATR');

var Indicator = function (settings)
{
  this.input = 'candle';
  this.currentPrice = 0;
  this.buyPrice = 0; 
  this.result = 'none'; //what should the strategy do?
  this.previousAction = 'none'; //are you long or short?
  this.prices = []; //store the recent prices
  this.atrLength = settings.atr //max window of prices
  this.trailing = false; //to trail or not to trail

  //initialize the required ATR indicator
  this.atr = new ATR(this.atrLength);
  
  //stoploss variables
  this.stopMultiple = settings.stoploss; 
  this.stoplossPrice = 0;
  this.TP1Multiple = settings.tp1; 
  this.TP1Price = 0;
  this.TP2Multiple = settings.tp2; 
  this.TP2Price = 0;
}


Indicator.prototype.update = function (candle)
{
  //update the ATR
  this.atr.update(candle);

  //update current price window
  this.currentPrice = candle.close;
  this.prices.push(this.currentPrice);
  if (this.prices.length > this.atrLength)
    this.prices.shift();

  //update the stops
  if (this.previousAction === 'buy')
  {
    this.checkStops();
  }
}


Indicator.prototype.checkStops = function ()
{
  if (this.currentPrice < this.stoplossPrice)
  {
    // stopped out - sell
    this.result = 'stoploss'; 
    this.previousAction = 'sell';
    this.trailing = false;
  }
  else if (this.currentPrice > this.buyPrice)
  {
    // price rose, need to update stops upwards
    this.updateStops();
    this.result = 'continue'; 
  }
  else
  {
    // price dropped within range, nothing to do 
    this.result = 'continue'; 
  }
}

Indicator.prototype.updateStops = function ()
{
  // update trailing stop to the local low
  if (this.trailing)
  {
    let localLow = Math.min(...this.prices);
    if (localLow > this.stoplossPrice)
    {
      this.stoplossPrice = localLow;
      console.log("Stoploss Updated: " + localLow);
    }
  }

  // check for take profit targets 
  // not else-if as price can massively spike
  if (this.currentPrice > this.TP1Price)
  {
    // Move stoploss to break even at this level
    if (this.stoplossPrice < this.buyPrice)
      this.stoplossPrice = this.buyPrice;    
  }
  if (this.currentPrice > this.TP2Price && this.currentPrice > this.TP1Price)
  {
    // Move stoploss to Take Profit 1 at this level
    if (this.stoplossPrice < this.TP1Price)
      this.stoplossPrice = this.TP1Price; 
    // Set stoploss to trailing
    this.trailing = true;
  }
}

Indicator.prototype.long = function (price)
{
  this.previousAction = 'buy';
  this.buyPrice = price;
  this.result = 'none';
  this.trailing = false;

  //set stoploss and take profit targets
  this.stoplossPrice = price - (this.stopMultiple * this.atr.result);
  this.TP1Price = price + (this.TP1Multiple * this.atr.result);
  this.TP2Price = price + (this.TP2Multiple * this.atr.result);

  return (this.stopMultiple * this.atr.result);
}

module.exports = Indicator;

