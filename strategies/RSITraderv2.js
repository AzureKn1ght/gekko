/*
	CREATED BY PHILSON
*/

// imports
var fs = require('fs');
var log = require('../core/log.js');
var config = require('../core/util.js').getConfig();
var RSI = require('./indicators/RSI.js');
var EMA = require('./indicators/EMA.js');
var ATRStopLoss = require('./indicators/ATRStopLoss.js');

// filepaths 
var tradedatafile;
var filepath = {
	tradefilepath: __dirname + "/trade_files/"
};

// strategy
var strat = {

	/* INIT */
	init: function ()
	{
		// core stuff
		this.name = 'RSITraderv2';
		this.requiredHistory = config.tradingAdvisor.historySize;
		this.prevAction = 'none';

		// Define the indicators we need
		this.addIndicator('stoploss', 'ATRStopLoss', this.settings.STOPS);

		// EMA
		this.addIndicator('maSlow', 'EMA', this.settings.EMA.long);
		this.addIndicator('maFast', 'EMA', this.settings.EMA.short);

		// RSI
		this.addIndicator('BULL_RSI', 'RSI', { interval: this.settings.BULL.rsi });
		this.addIndicator('BEAR_RSI', 'RSI', { interval: this.settings.BEAR.rsi });

		// ADX
		this.addIndicator('ADX', 'ADX', this.settings.ADX.adx);

		// MOD (RSI modifiers)
		this.BULL_MOD_high = this.settings.BULL.mod_high;
		this.BULL_MOD_low = this.settings.BULL.mod_low;
		this.BEAR_MOD_high = this.settings.BEAR.mod_high;
		this.BEAR_MOD_low = this.settings.BEAR.mod_low;

		// restore last trade before crash
		this.tradeRestore();

		/* INIT DONE MESSAGE */
		log.info("====================================");
		log.info('Running', this.name);
		log.info('====================================');

	}, // init()


	/* CHECK */
	check: function (candle)
	{
		// Get indicator results
		let ind = this.indicators;
		let currentPrice = candle.close;
		let adx = ind.ADX.result;

		// Check whether to stop out 
		this.stopLoss();

		// Check the trend
		let bullTrend = this.checkTrend();

		// BULL TREND
		if (bullTrend)
		{
			// Get RSI based on BULL values
			rsi = ind.BULL_RSI.result; 
			let rsi_hi = this.settings.BULL.high;
			let rsi_low = this.settings.BULL.low;

			// ADX trend strength modifiers 
			if (adx > this.settings.ADX.threshold)
			{
				rsi_hi = rsi_hi + this.BULL_MOD_high;
				rsi_low = rsi_low + this.BULL_MOD_low;
			}

			if (rsi > rsi_hi) this.short();
			else if (rsi < rsi_low) this.long(currentPrice);
		}

		// BEAR TREND
		else
		{
			// Get RSI based on BEAR values
			rsi = ind.BEAR_RSI.result; 
			let rsi_hi = this.settings.BEAR.high;
			let rsi_low = this.settings.BEAR.low;

			// ADX trend strength modifiers 
			if (adx > this.settings.ADX.threshold)
			{
				rsi_hi = rsi_hi + this.BEAR_MOD_high;
				rsi_low = rsi_low + this.BEAR_MOD_low;
			}

			if (rsi > rsi_hi) this.short();
			else if (rsi < rsi_low) this.long(currentPrice);
		}

	}, // check()


	///////////////////////
	//	HELPER FUNCTIONS
	///////////////////////
	/* LONG */
	long: function (price)
	{
		if (this.prevAction !== 'buy')
		{
			this.prevAction = 'buy';
			let sl = this.indicators.stoploss.long(price);
			log.info('Going long');
			log.info('Stoploss: ' + sl);

			try
			{
				this.storeTrade();
				this.advice('long');

				return this.advice({
					direction: 'long',
					trigger: {
						type: 'trailingStop',
						trailValue: sl
					}
				});
			}
			catch (error)
			{
				log.error(error);
				return;
			}
		}
		return;
	},
	/* SHORT */
	short: function ()
	{
		if (this.prevAction !== 'sell')
		{
			this.prevAction = 'sell';
			log.info('Going short');

			try
			{
				this.storeTrade();
				return this.advice('short');
			}
			catch (error)
			{
				log.error(error);
				return;
			}
		}
		return;
	},
	/* CHECK TREND */
	checkTrend: function ()
	{
		// get indicators
		let ind = this.indicators;
		let maSlow = ind.maSlow.result;
		let maFast = ind.maFast.result;

		if (!maSlow || !maFast) // Not enough time has passed
			return false;
		else if (maSlow == maFast) // Intersection point
			return false;
		else
			return (maFast > maSlow);
	},
	/* STOPLOSS */
	stopLoss: function ()
	{
		// get indicators
		let ind = this.indicators;
		// determine if need to short
		if (ind.stoploss.result === 'stoploss')
		{
			log.info('>>>>>>>>>> STOPLOSS triggered <<<<<<<<<<');
			return this.short();
		}
		return;
	},
	/* RESTORE */
	tradeRestore: function ()
	{
		// If stored file exists, retrieve from file
		tradedatafile = filepath.tradefilepath + this.settings.FILE.strat_name + '_trade.js';

		if (fs.existsSync(tradedatafile))
		{
			log.info('Trade Data Exists!');
			let data = JSON.parse(fs.readFileSync(tradedatafile, 'utf8'));
			log.info(data);

			if (data.prevAction === 'buy')
			{
				this.prevAction = 'buy';
				let sl = this.indicators.stoploss;
				sl.restore(data.prevAction, data.buy, data.lastHigh, data.stop, data.TP1, data.TP2, data.TP3);
			}
		}
	},
	/* SAVE */
	storeTrade: function ()
	{
		let tradeData = {
			prevAction: this.indicators.stoploss.previousAction,
			buy: this.indicators.stoploss.buyPrice,
			lastHigh: this.indicators.stoploss.lastHighPrice,
			stop: this.indicators.stoploss.stoplossPrice,
			TP1: this.indicators.stoploss.TP1Price,
			TP2: this.indicators.stoploss.TP2Price,
			TP3: this.indicators.stoploss.TP3Price
		}

		var fileoutput = JSON.stringify(tradeData);
		log.info(fileoutput);

		if (!fs.existsSync(filepath.tradefilepath))
			fs.mkdirSync(filepath.tradefilepath);

		fs.writeFileSync(tradedatafile, fileoutput, function (err)
		{
			if (err)
				log.error(error);

			log.info('trade info saved!');
		});
	},

	/* END backtest */
	end: function ()
	{
		log.info('====================================');
		log.info('RSITraderv2.js Ended');
		log.info('====================================');
	}

};

module.exports = strat;
