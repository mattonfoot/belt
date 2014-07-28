// query phrase config object

function Config( attr ) {
  this.attr = attr;
}

Config.prototype.from = function( attr, selector ) {
  this.from = {
    attr: attr,
    selector: selector
  };

  return this;
};

Config.prototype.when = function( relationship, filter ) {
  this.when = {
    relationship: relationship,
    filter: filter
  };

  return this;
};

// parser factory

function get( attr ) {
  var config = new Config( attr );

  return config;
}

function region( relationship, selector ) {
    return {
      relationship: relationship,
      selector: selector,
      node: 'region'
    };
}

function board( selector ) {
    return {
      selector: selector,
      node: 'board'
    };
}

function Parser( phrase ) {
  var matches = phrase.match(/(get|from|when)/ig);
  if (!matches || matches.length < 2) {
    return {};
  }

  var out = phrase.replace(/\sof\s/ig, ' ').replace(/board\s#([^\s]*)/ig, 'this.board(\'#$1\')').trim();
  out = out.replace(/(board[^\(])\s/ig, '\'$1\' ').trim();
  out = out.replace(/\sboard(?:\s|$)/ig, ' \'board\' ').trim();
  out = out.replace(/region\s([^\s]*)\s([^\s]*)/ig, 'this.region(\'$1\',$2)').trim();
  out = out.replace(/\sregion(?:\s|$)/ig, ' \'region\' ').trim();
  out = out.replace(/get\s([^\s]*)/ig, 'this.get(\'$1\')').trim();
  out = out.replace(/\sfrom\s([^\s]*)\s([^\s]*)/ig, '.from(\'$1\',$2)').trim();
  out = out.replace(/\swhen\s([^\s]*?)\s([^\s]*)/ig, '.when(\'$1\',$2)').trim();

  if (out === phrase) {
    return {};
  }

  /*jslint evil: true */
  return (new Function( 'return ' + out )).call({
      get: get,
      region: region,
      board: board
  });
}

module.exports = Parser;
