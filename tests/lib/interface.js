var RSVP = require('rsvp')
  , Promise = RSVP.Promise;

// Commands

function Interface( queue ) {
    this._queue = queue;
}

Interface.prototype.preventDefault = function( ev ) {
    return new Promise(function( resolve, reject ) {
        ev.preventDefault();

        resolve( ev );
    });
};

Interface.prototype.extractTargetId = function( ev ) {
    return this.preventDefault( ev )
        .then(function( ev ) {
            var el = ev.target;

            return el['data-target'];
        });
};

Interface.prototype.extractAddWallData = function( ev ) {
    return this.preventDefault( ev )
        .then(function( ev ) {
            var form = ev.target;

            var data = {
                name: form.name
            };

            return data;
        });
};

Interface.prototype.extractModifyWallData = function( ev ) {
    return new Promise(function( resolve, reject ) {
        var form = ev.target;

        var data = {
            id: form.id,
            name: form.name
        };

        resolve( data );
    });
};

Interface.prototype.extractAddBoardData = function( ev ) {
    return new Promise(function( resolve, reject ) {
        var form = ev.target;

        var data = {
            name: form.name,
            wall: form.wall
        };

        resolve( data );
    });
};

Interface.prototype.extractModifyBoardData = function( ev ) {
    return new Promise(function( resolve, reject ) {
        var form = ev.target;

        var data = {
            id: form.id,
            name: form.name,
            wall: form.wall
        };

        resolve( data );
    });
};

Interface.prototype.extractAddRegionData = function( ev ) {
    return new Promise(function( resolve, reject ) {
        var form = ev.target;

        var data = {
            label: form.label,
            value: form.value,
            color: form.color,
            board: form.board
        };

        resolve( data );
    });
};

Interface.prototype.extractModifyRegionData = function( ev ) {
    return new Promise(function( resolve, reject ) {
        var form = ev.target;

        var data = {
            id: form.id,
            label: form.label,
            value: form.value,
            color: form.color,
            board: form.board
        };

        resolve( data );
    });
};

Interface.prototype.extractAddPocketData = function( ev ) {
    return new Promise(function( resolve, reject ) {
        var form = ev.target;

        var data = {
            title: form.title,
            wall: form.wall
        };

        resolve( data );
    });
};

Interface.prototype.extractModifyPocketData = function( ev ) {
    return new Promise(function( resolve, reject ) {
        var form = ev.target;

        var data = {
            id: form.id,
            title: form.title,
            wall: form.wall
        };

        resolve( data );
    });
};

Interface.prototype.displayBoardSelector = function( boards ) {
    this._queue.trigger( 'boardselector:display', boards );
};

Interface.prototype.displayBoard = function( board ) {
    this._queue.trigger( 'board:display', board );
};

Interface.prototype.displayBoardCreator = function( wall ) {
    this._queue.trigger( 'boardcreator:display', { wall: wall.getId() } );
};

Interface.prototype.displayBoardEditor = function( board ) {
    this._queue.trigger( 'boardeditor:display', board );
};

Interface.prototype.addBoard = function( board ) {
    this._queue.trigger( 'board:add', board );

    this.displayBoard( board );
};

Interface.prototype.displayRegionCreator = function( board ) {
      this._queue.trigger( 'regioncreator:display', { board: board.getId() } );
};

Interface.prototype.displayRegionEditor = function( region ) {
    this._queue.trigger( 'regioneditor:display', region );
};

Interface.prototype.displayPocketCreator = function( wall ) {
    this._queue.trigger( 'pocketcreator:display', { wall: wall.getId() } );
};

Interface.prototype.displayPocketEditor = function( pocket ) {
    this._queue.trigger( 'pocketeditor:display', pocket );
};

Interface.prototype.displayWallCreator = function() {
    this._queue.trigger( 'wallcreator:display', {} );
};

Interface.prototype.displayWallEditor = function( wall ) {
    this._queue.trigger( 'walleditor:display', wall );
};

Interface.prototype.displayWallSelector = function( walls ) {
    this._queue.trigger( 'wallselector:display', walls );
};

Interface.prototype.displayWall = function( wall ) {
    this._queue.trigger( 'wall:display', wall );
};

Interface.prototype.notifyWallFirstTime = function( wall ) {
    this._queue.trigger( 'wall:firsttime', wall );
};

module.exports = Interface;
