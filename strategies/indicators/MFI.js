//https://en.wikipedia.org/wiki/Money_flow_index
var Indicator = function(config) {
	this.input = 'candle';
	this.result = 0;
	this.config = config;
	this._candles = [];
}
Indicator.prototype.update = function(candle) {
	
	this._candles.push(candle);
		
	if(this._candles.length >= this.config.optInTimePeriod+1){
		this.calc()
		this._candles.shift();
	}
	
	return this.result;
}

Indicator.prototype.calc = function() {
	
	console.log('candles.length',this._candles.length);
	
	var positiveMoneyFlow = 0;
	var negativeMoneyFlow = 0;
	
	for(var i = this.config.optInTimePeriod; i>0; i--){
		console.log('counter:',i);
		var typicalPriceCurrent = (this._candles[i].high + this._candles[i].low + this._candles[i].close) / 3;
		var typicalPricePrevious = (this._candles[i-1].high + this._candles[i-1].low + this._candles[i-1].close) / 3;
						
		var rawMoneyFlowCurrent = typicalPriceCurrent * this._candles[i].volume;
		var rawMoneyFlowPrevious = typicalPricePrevious * this._candles[i-1].volume;
						
		if(typicalPriceCurrent >= typicalPricePrevious) {
			positiveMoneyFlow += rawMoneyFlowCurrent;
		}else{
			negativeMoneyFlow += rawMoneyFlowCurrent;
		}
	}
		
	var moneyFlowRatio = positiveMoneyFlow / negativeMoneyFlow;
		
	var MFIresult = 100 - (100 / (1+moneyFlowRatio)); 
		
	this.result = MFIresult;
}
module.exports = Indicator;