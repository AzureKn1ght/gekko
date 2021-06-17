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
  this.lastHighPrice = 0; //store the last highest close
  this.result = 'none'; //what should the strategy do?
  this.previousAction = 'none'; //are you long or short?

  //initialize the required ATR indicator
  this.atr = new ATR(settings.atr);
  
  //stoploss variables
  this.stopMultiple = settings.stoploss; //default 1.5x ATR
  this.stoplossPrice = 0;
  this.TP1Multiple = settings.tp1; //default 1x ATR
  this.TP1Price = 0;
  this.TP2Multiple = settings.tp2; //default 2 ATR
  this.TP2Price = 0;
  this.TP3Multiple = settings.tp3; //default 3x ATR
  this.TP3Price = 0;
}

Indicator.prototype.update = function (candle)
{
  //update the ATR
  this.atr.update(candle);

  //update current price
  this.currentPrice = candle.close;

  //update the stops
  if (this.previousAction === 'buy')
  {
    this.checkStops();
  }
  else if (this.previousAction === 'sell')
  {
    this.result = 'none';
  }
}


Indicator.prototype.checkStops = function ()
{
  if (this.currentPrice < this.stoplossPrice)
  {
    // stopped out - sell
    this.result = 'stoploss'; 
    this.previousAction = 'sell';
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
  // update trailing stop if there new lastHighPrice
  if (this.currentPrice > this.lastHighPrice)
  {
    let percentChange = ((this.currentPrice - this.lastHighPrice) / this.lastHighPrice) + 1;
    this.stoplossPrice = this.stoplossPrice * percentChange;
    this.lastHighPrice = this.currentPrice;
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
  }
  if (this.currentPrice > this.TP3Price && this.currentPrice > this.TP2Price && this.currentPrice > this.TP1Price)
  {
    // Move stoploss to Take Profit 2 at this level
    if (this.stoplossPrice < this.TP2Price)
      this.stoplossPrice = this.TP2Price; 
  }
}


Indicator.prototype.long = function (price)
{
  if (this.previousAction === 'buy')
    return;

  this.previousAction = 'buy';
  this.buyPrice = price;
  this.lastHighPrice = price;
  this.result = 'none'; 

  //set stoploss and take profit targets
  this.stoplossPrice = price - (this.stopMultiple * this.atr.result);
  this.TP1Price = price + (this.TP1Multiple * this.atr.result);
  this.TP2Price = price + (this.TP2Multiple * this.atr.result);
  this.TP3Price = price + (this.TP3Multiple * this.atr.result);

  return (this.stopMultiple * this.atr.result);
}

Indicator.prototype.restore = function (prevAction, buy, lastHigh, stop, TP1, TP2, TP3)
{
  this.previousAction = prevAction;
  this.buyPrice = buy;
  this.lastHighPrice = lastHigh;
  this.result = 'none';

  //restore stoploss and take profit targets
  this.stoplossPrice = stop;
  this.TP1Price = TP1;
  this.TP2Price = TP2;
  this.TP3Price = TP3;
}

module.exports = Indicator;
