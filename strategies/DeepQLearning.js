// This strategy incorporates the Deep Q Learning neural net moddel. The neural net essentially learns through
// exploring different possible actions. If it performs the correct action defined by a benchmark function, it
// will be treated with a reward. The neural net's job is to obtain as many rewards it can


var log = require('../core/log.js');
var config = require('../core/util.js').getConfig();
const N = require('neataptic');
const fs = require('fs')

// Save trained NN in case server crash
var nndatafile;
var filepath = {
	nnfilepath: "./DQL_OUT/"
};

var strat = {

	// INIT: Prepare everything our strat needs
	init = function ()
	{
		this.ASSET_MAX_PRICE = 17900;
		this.requiredHistory = 0; //overwrite 

		this.myLSTM = new N.architect.LSTM(13, 4, 4, 4, 3);

		//Change output to linear activation function
		this.myLSTM.nodes[this.myLSTM.nodes.length - 1].squash = N.methods.activation.IDENTITY;
		this.myLSTM.nodes[this.myLSTM.nodes.length - 2].squash = N.methods.activation.IDENTITY;
		this.myLSTM.nodes[this.myLSTM.nodes.length - 3].squash = N.methods.activation.IDENTITY;



		this.random_decay_fac = this.settings.DECAY.factor;
		this.random_decay_iterations = this.settings.DECAY.iterations;
		this.random_counter = 0;
		this.randomness = 1;
		this.total_pl = 0;


		this.currency = this.settings.MISC.currency;
		this.asset = this.settings.MISC.asset;
		this.feeMaker = this.settings.MISC.feeMaker;
		this.starting_currency = this.currency;


		this.current_state = [];
		this.last_state = [];
		this.current_output = [];
		this.last_output = [];
		this.current_action_index = 2; // 0 - buy , 1 - sell, 2 - do nothing
		this.last_action_index = 2;
		this.new_reward = 0;

		this.FIRST_RUN = true;

		this.trend = "none";
		this.buying_price;
		this.round_trip_pl = 0;
		this.in_position = false;

		//RSI INDICATOR
		this.addIndicator('myrsi', 'RSI', { interval: this.settings.INDICATORS.rsi });

		//MACD INDICATOR
		var settings = {
			short: this.settings.INDICATORS.macd_slow,
			long: this.settings.INDICATORS.macd_fast,
			signal: this.settings.INDICATORS.macd_signal
		};

		// add the indicator to the strategy
		this.addIndicator('mymacd', 'MACD', settings);

	},


	// UPDATE: Things to update on every candle
	update = function (candle)
	{
		this.ASSET_MAX_PRICE = Math.max(this.ASSET_MAX_PRICE, candle.high);

		//update last state & output
		this.last_state = this.current_state;
		this.last_output = this.current_output;
		this.last_action_index = this.current_action_index;

		//update current state & output
		this.current_state = [];
		this.current_output = [];

		//obtain current state
		this.current_state.push(this.normalize_price(candle.open, this.ASSET_MAX_PRICE));
		this.current_state.push(this.normalize_price(candle.high, this.ASSET_MAX_PRICE));
		this.current_state.push(this.normalize_price(candle.low, this.ASSET_MAX_PRICE));
		this.current_state.push(this.normalize_price(candle.close, this.ASSET_MAX_PRICE));
		this.current_state.push(this.normalize_price(candle.vwp, this.ASSET_MAX_PRICE));
		this.current_state.push(this.log_normlize(candle.volume));
		this.current_state.push(this.log_normlize(candle.trades));

		//WTF is this?
		(this.trend == "up") ? this.current_state.push(1) : this.current_state.push(0);
		(this.trend == "down") ? this.current_state.push(1) : this.current_state.push(0);
		(this.trend == "none") ? this.current_state.push(1) : this.current_state.push(0);

		//RSI
		this.current_state.push(this.indicators.myrsi.result / 100);

		//MACD
		var macdResult = this.indicators.mymacd;
		this.current_state.push(this.log_normlize(macdResult.short.result));
		this.current_state.push(this.log_normlize(macdResult.long.result));

	},


	// CHECK: Check whether to go Long or Short
	check = function (candle)
	{

		console.log("================");


		//import nn
		var nndatafile = './DQL_OUT/DQL_out.json'
		if (fs.existsSync(nndatafile))
		{
			var rawdata = fs.readFileSync('./DQL_OUT/DQL_out.json');
			var procData = JSON.parse(rawdata);
			this.myLSTM = N.Network.fromJSON(procData);
		}

		//obtain current output with current state and update current_action_index and perform action
		this.current_output = this.myLSTM.activate(this.current_state);
		console.log("current_output: " + this.current_output);

		//apply randomness
		this.random_counter += 1;
		if (this.random_counter / this.random_decay_iterations == 1)
		{
			this.randomness *= this.random_decay_fac;

			this.random_counter = 0;
		}
		console.log("randomness: " + this.randomness);

		var rand_num = Math.random();
		if (rand_num < this.randomness)
		{
			this.current_action_index = Math.floor(Math.random() * (2 - 0 + 1)) + 0;
			console.log("action chosen randomly");
		}
		else
		{
			this.current_action_index = this.best_action(this.current_output);
			console.log("action chosen by DQL");
		}

		console.log("action: " + this.current_action_index);
		switch (this.current_action_index)
		{
			case 0: // buy
				{
					if (this.in_position == false)
					{

						this.advice('long');
						this.currency *= 1 - (this.feeMaker / 100);
						this.asset = (this.currency / candle.close);
						this.currency = 0;
						this.trend = 'up';
						this.buying_price = candle.close;
						this.in_position = true;
						this.round_trip_pl = 0;
						console.log("close: " + candle.close);
						//console.log("currency: " + this.currency);
						//console.log("asset: " + this.asset);

					}

					break;
				}
			case 1:
				{
					if (this.in_position == true)
					{

						this.advice('short');

						this.currency = this.asset * candle.close;
						this.currency *= 1 - this.feeMaker / 100;
						this.asset = 0;
						this.trend = 'down';
						this.in_position = false;
						this.round_trip_pl = ((candle.close - this.buying_price) / this.buying_price) * 100; // in percent
						this.round_trip_pl -= this.feeMaker;
						//console.log("close: " + candle.close);
						//console.log("buy: " + this.buying_price);
						//console.log("close: " + candle.close);
						//console.log("currency: " + this.currency);
						//console.log("asset: " + this.asset);

					}

					break;
				}
			case 2:
				{
					this.trend = 'none';
					this.round_trip_pl = 0;
					break;
				}
		}



		console.log("asset: " + this.asset);
		console.log("currency: " + this.currency);
		var asset_to_curr = this.asset * candle.close;

		this.total_pl = ((asset_to_curr + this.currency) / this.starting_currency) * 100 - 100;
		console.log("this.total_pl: " + this.total_pl);


		//log, save profit loss and obtain reward from PREVIOUS action 
		console.log("round_trip_pl: " + this.round_trip_pl);
		this.new_reward = this.get_reward();
		console.log("new reward: " + this.new_reward);
		this.round_trip_pl = 0;








		//if first run then skip 
		if (this.FIRST_RUN)
		{
			console.log("Skipped at first run");
			this.FIRST_RUN = false;
			return;
		}




		//train last state with last output modified with new reward + max current output
		this.last_output[this.last_action_index] = this.new_reward + this.current_output[this.current_action_index];
		var myTrainingSet = [
			{ input: this.last_state, output: this.last_output }
		];
		this.myLSTM.train(myTrainingSet, {
			log: this.settings.NN.log,
			iterations: this.settings.NN.iterations,
			error: this.settings.NN.error,
			rate: this.settings.NN.rate,
			dropout: this.settings.NN.dropout,
			clear: true,
			cost: N.methods.cost.MSE
		});


		//save nn
		var exported = this.myLSTM.toJSON();
		var data = JSON.stringify(exported, null, 2);
		fs.writeFileSync('./DQL_OUT/DQL_out.json', data);



		// For debugging purposes.
		strat.log = function () { }






	},


	/* HELPER FUNCTIONS */
	// Used to facilitate operations
	storeNN: function ()
	{
		var fileoutput = JSON.stringify(this.myLSTM.toJSON());
		fs.writeFileSync(nndatafile, fileoutput, function (err)
		{
			if (err) throw err;
			console.log('Learn state saved!');
		});
	},
	//HELPER: price normalization function
	normalize_price = function (price, max_price)
	{
		return price / max_price;
	},
	//HELPER: rewrites number to decimal form
	//1234 -> 0.1234
	log_normlize = function (val)
	{
		var neg = (val < 0) ? true : false;
		var val = Math.abs(val);
		if (val == 0)
			return 0;
		else
		{
			var divisor = Math.pow(10, Math.floor(Math.log10(val)) + 1);
			var output = (neg) ? (-1 * (val / divisor)) : (val / divisor);
			return output;
		}

	},
	//HELPER: calculates Reward for the NN
	get_reward = function ()
	{
		return this.round_trip_pl / 100;

	},
	//HELPER: iterate thru Actions arr to find best Action
	best_action = function (arr)
	{
		var max = 0;
		for (var i = 1; i < arr.length; i++)
		{
			if (arr[i] > arr[max])
			{
				var max = i;
			}
		}
		return max;
	},
	/* END */
	// Happens at the end of backtests
	end: function ()
	{
		log.debug("NN output to store: ", JSON.stringify(this.nn.toJSON()));
		this.storeNN();
		log.debug('Triggered stoploss', this.stoplossCounter, 'times');
	}

};

module.exports = strat;
