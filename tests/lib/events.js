var RSVP = require('rsvp')
  , Promise = RSVP.Promise;

// Events

function Events() {

}

Events.prototype.preventDefault = function( ev ) {
    return new Promise(function( resolve, reject ) {
        ev.preventDefault();

        resolve( ev );
    });
};

Events.prototype.extractTargetId = function( ev ) {
    return this.preventDefault( ev )
        .then(function( ev ) {
            var el = ev.target;

            return el['data-target'];
        });
};

Events.prototype.extractAddWallData = function( ev ) {
    return this.preventDefault( ev )
        .then(function( ev ) {
            var form = ev.target;

            var data = {
                name: form.name
            };

            return data;
        });
};

Events.prototype.extractModifyWallData = function( ev ) {
    return new Promise(function( resolve, reject ) {
        var form = ev.target;

        var data = {
            id: form.id,
            name: form.name
        };

        resolve( data );
    });
};

Events.prototype.extractAddBoardData = function( ev ) {
    return new Promise(function( resolve, reject ) {
        var form = ev.target;

        var data = {
            name: form.name,
            wall: form.wall
        };

        resolve( data );
    });
};

Events.prototype.extractModifyBoardData = function( ev ) {
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

Events.prototype.extractAddRegionData = function( ev ) {
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

Events.prototype.extractModifyRegionData = function( ev ) {
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

Events.prototype.extractAddPocketData = function( ev ) {
    return new Promise(function( resolve, reject ) {
        var form = ev.target;

        var data = {
            title: form.title,
            wall: form.wall
        };

        resolve( data );
    });
};

Events.prototype.extractModifyPocketData = function( ev ) {
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

module.exports = Events;
