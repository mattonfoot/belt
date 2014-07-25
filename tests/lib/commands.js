var RSVP = require('rsvp')
  , Promise = RSVP.Promise;

// Commands

function Commands( adapter ) {
    this._db = adapter;
}

var models = [ 'Board', 'Card', 'Pocket', 'Region', 'Wall' ];
var commands = [ 'create', 'update' ];

commands.forEach(function( command ) {
    models.forEach(function( model ) {
        Commands.prototype[ command + model ] = function( data ) {
            return this._db[command]( model.toLowerCase(), data); // --> model:commanded ( board:created, pocket:updated )
        };
    });
});

Commands.prototype.addPocketsToBoard = function( board, pockets ) {
    var _this = this;

    var promises = pockets.map(function( pocket ) {
        return _this.createCard( { board: board.getId(), pocket: pocket.getId() } );
    });

    return RSVP.all( promises );
};

Commands.prototype.addPocketToBoards = function( boards, pocket ) {
    var _this = this;

    var promises = boards.map(function( board ) {
        return _this.createCard( { board: board.getId(), pocket: pocket.getId() } );
    });

    return RSVP.all( promises );
};

module.exports = Commands;
