var SMMA = require('./SMMA.js');
var convnetjs = require('convnetjs');
var math = require('mathjs');
var log = require('../../core/log.js');
var fs = require('fs');

// Save trained NN in case server crash
var nndatafile;
var filepath = {
  nnfilepath: __dirname + "/nn_files/"
};

var Indicator = function (settings)
{
  this.input = 'candle'
  this.priceBuffer = [];
  this.scale = 1;
  this.prediction = 0;
  this.nn = new convnetjs.Net();

  // Settings taken from TOML
  this.price_buffer_len = settings.NN.price_buffer_len;
  this.SMMA = new SMMA(settings.NN.SMMA);
  this.decay = settings.NN.decay;

  // Create the NN
  // If stored file exists, retrieve from file
  nndatafile = filepath.nnfilepath + settings.FILE.strat_name + '_trained.js';
  if (fs.existsSync(nndatafile))
  {
    log.debug('Stored NN Exists!');
    this.nn.fromJSON(JSON.parse(fs.readFileSync(nndatafile, 'utf8')));
  }
  else
  {
    let layers = [
      { type: 'input', out_sx: 1, out_sy: 1, out_depth: 1 },
      { type: 'fc', num_neurons: 0, activation: 'tanh' },
      { type: 'regression', num_neurons: 1 }
    ];

    this.nn.makeLayers(layers);
  }


  this.trainer = new convnetjs.Trainer(this.nn, {
    method: 'adadelta',
    batch_size: 1,
    eps: 1e-6,
    ro: 0.95,
    l2_decay: this.decay
  });
}

Indicator.prototype.setNormalizeFactor = function (candle)
{
  this.scale = Math.pow(10, Math.trunc(candle.high).toString().length + 2);
  log.debug('Set normalization factor to', this.scale);
}

Indicator.prototype.learn = function ()
{
  for (let i = 0; i < this.priceBuffer.length - 1; i++)
  {
    let data = [this.priceBuffer[i]];
    let current_price = [this.priceBuffer[i + 1]];
    let vol = new convnetjs.Vol(data);
    this.trainer.train(vol, current_price);
  }

  //Write the NN to file in case server crash
  let fileoutput = JSON.stringify(this.nn.toJSON());
  fs.writeFileSync(nndatafile, fileoutput, function (err)
  {
    if (err) throw err;
    console.log('Learn state saved - ' + this.settings.FILE.strat_name);
  });
}

Indicator.prototype.predictCandle = function ()
{
  let vol = new convnetjs.Vol(this.priceBuffer);
  let prediction = this.nn.forward(vol);
  return prediction.w[0];
}

Indicator.prototype.update = function (candle)
{
  this.SMMA.update((candle.high + candle.close + candle.low + candle.vwp) / 4);
  let smmaFast = this.SMMA.result;

  if (1 === this.scale && 1 < candle.high && 0 === this.predictionCount) this.setNormalizeFactor(candle);

  this.priceBuffer.push(smmaFast / this.scale);
  if (2 > this.priceBuffer.length) return;

  this.learn();

  while (this.price_buffer_len < this.priceBuffer.length) this.priceBuffer.shift();

  this.prediction = this.predictCandle() * this.scale;
}

module.exports = Indicator;
