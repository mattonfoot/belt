var RSVP = require('rsvp')
  , Promise = RSVP.Promise;

// Application

function Services( interface, commands, queries ) {
    this._commands = commands;
    this._queries = queries;
    this._interface = interface;
}

// board:new
Services.prototype.newBoard = function() {
    return this._interface.displayBoardCreator();
};

// board:create
Services.prototype.createBoard = function( data ) {
    var _this = this, board, phrase;

    if (data.transform) {
        phrase = data.transform;

        delete data.transform;
    }

    return this._commands
        .createBoard( data )  // --> board:created
        .then(function( resource ) {
            board = resource;

            return board;
        })
        .then(function( board ) {
            if (phrase && phrase !== '') {
                return _this.createTransform({
                        board: board.getId(),
                        phrase: phrase
                    })
                    .then(function( transform ) {
                        board.transforms.push( transform.getId() );

                        return board;
                    });
            }

            return board;
        })
        .then(function( board ) {
            _this._interface.addBoard( board );

            return _this._queries.getWall( board.getWall() );
        })
        .then(function( wall ) {
            return _this._queries.getPocketsForWall( wall );
        })
        .then(function( pockets ) {
            _this._commands.addPocketsToBoard( board, pockets );  // --> cardlocation:created

            return board;
        });
};

// board:edit
Services.prototype.editBoard = function( id ) {
    var _this = this;

    return this._queries
        .getBoard( id )
        .then(function( board ) {
            _this._interface.displayBoardEditor( board );

            return board;
        });
};

// board:update
Services.prototype.updateBoard = function( data ) {
    var _this = this, phrase;

    if (data.transform) {
        phrase = data.transform;

        delete data.transform;
    }

    return this._commands.updateBoard( data )  // --> board:updated
        .then(function( board ) {
            if (phrase && phrase !== '') {
                return _this.createTransform({
                        board: board.getId(),
                        phrase: phrase
                    })
                    .then(function( transform ) {
                        board.transforms.push( transform.getId() );

                        return board;
                    });
            }

            return board;
        });

};

// board:display
// board:created
Services.prototype.displayBoard = function( id ) {
    var _this = this;

    return this._queries
        .getBoard( id )
        .then(function( board ) {
            _this._interface.displayBoard( board );  // --> board:displayed

            return board;
        });
};

// board:select
Services.prototype.selectBoard = function( wall ) {
    var _this = this;

    return this._queries
        .getBoardsForWall( wall )
        .then(function( boards ) {
            _this._interface.displayBoardSelector( boards );  // --> boardselector:displayed

            return boards;
        });
};





// cardlocations

// cardlocation:created
Services.prototype.displayCardLocation = function( id ) {
    var _this = this;

    return this._queries
        .getCardLocation( id )
        .then(function( location ) {
            return callDisplayCardLocationWithPocket.call( _this, location );
        });
};

// board:displayed
Services.prototype.displayCardLocations = function( board ) {
    var _this = this;

    return this._queries
        .getCardLocationsForBoard( board )
        .then(function( locations ) {
            var promises = locations.map(function( location ) {
                return callDisplayCardLocationWithPocket.call( _this, location );
            });

            return RSVP.all( promises );
        });
};

function callDisplayCardLocationWithPocket( location ) {
    var _this = this;

    return this._queries.getPocket( location.getPocket() )
        .then(function( pocket ) {
            _this._interface.displayCardLocation( location, pocket );  // --> cardlocation:displayed

            return location;
        });
}

// cardlocation:move
Services.prototype.moveCardLocation = function( info ) {
    var _this = this;

    return this._queries
        .getCardLocation( info.id )
        .then(function( cardlocation ) {
            if ( cardlocation.x != info.x || cardlocation.y != info.y ) {
              cardlocation.x = info.x;
              cardlocation.y = info.y;

              return _this._commands.updateCardLocation( cardlocation );  // --> cardlocation:updated
            }
        });
};






// pockets

// pocket:new
Services.prototype.newPocket = function() {
    return this._interface.displayPocketCreator();
};

// pocket:create
Services.prototype.createPocket = function( data ) {
    var _this = this, pocket;

    return this._commands
        .createPocket( data )  // --> pocket:created
        .then(function( resource ) {
            pocket = resource;

            return _this._queries.getWall( pocket.getWall() );
        })
        .then(function( wall ) {
            return _this._queries.getBoardsForWall( wall );
        })
        .then(function( boards ) {
            _this._commands.addPocketToBoards( boards, pocket );  // --> cardlocation:created

            return pocket;
        });
};

// pocket:edit
Services.prototype.editPocket = function( id ) {
    var _this = this;

    return this._queries
        .getPocket( id )
        .then(function( pocket ) {
            _this._interface.displayPocketEditor( pocket );

            return pocket;
        });
};

// pocket:update
Services.prototype.updatePocket = function( data ) {
    return this._commands.updatePocket( data );  // --> pocket:updated
};






// regions

// region:created
Services.prototype.displayRegion = function( id ) {
    var _this = this;

    return this._queries
        .getRegion( id )
        .then(function( region ) {
            _this._interface.displayRegion( region );  // --> region:displayed

            return region;
        });
};

// board:displayed
Services.prototype.displayRegions = function( board ) {
    var _this = this;

    return this._queries
        .getRegionsForBoard( board )
        .then(function( regions ) {
            _this._interface.displayRegions( regions );  // --> region:displayed

            return regions;
        });
};
// region:new
Services.prototype.newRegion = function() {
    return this._interface.displayRegionCreator();
};

// region:create
Services.prototype.createRegion = function( data ) {
    return this._commands.createRegion( data );  // --> region:created
};

// region:edit
Services.prototype.editRegion = function( id ) {
    var _this = this;

    return this._queries.getRegion( id )
        .then(function( region ) {
            _this._interface.displayRegionEditor( region );

            return region;
        });
};

// region:move
Services.prototype.moveRegion = function( info ) {
  var _this = this;

  return this._queries
      .getRegion( info.id )
      .then(function( region ) {
          if ( region.x != info.x || region.y != info.y ) {
            region.x = info.x;
            region.y = info.y;

            return _this._commands.updateRegion( region );  // --> region:updated
          }
      });
};

// region:resize
Services.prototype.resizeRegion = function( info ) {
  var _this = this;

  return this._queries
      .getRegion( info.id )
      .then(function( region ) {
          if ( region.height != info.height || region.width != info.width ) {
            region.height = info.height;
            region.width = info.width;

            return _this._commands.updateRegion( region );  // --> region:updated
          }
      });
};






// transforms

Services.prototype.createTransform = function( data ) {
    return this._commands.createTransform( data );  // --> region:created
};

// transform:unlink
Services.prototype.unlinkTransform = function( id ) {
    var _this = this;

    return this._queries
        .getTransform( id )
        .then(function( transform ) {
            return _this._commands.unlinkTransform( id );  // --> transform:unlinked
        })
        .then(function( transform ) {
            _this._interface.removeTransform( transform );

            return transform;
        });
};





// walls

// wall:new
Services.prototype.newWall = function() {
    this._interface.displayWallCreator();
};

// wall:create
Services.prototype.createWall = function( data ) {
    return this._commands.createWall( data ); // --> wall:created
};

// wall:edit
Services.prototype.editWall = function( id ) {
    var _this = this;

    return this._queries
        .getWall( id )
        .then(function( wall ) {
            _this._interface.displayWallEditor( wall );

            return wall;
        });
};

// wall:update
Services.prototype.updateWall = function( data ) {
    return this._commands.updateWall( data );  // --> wall:updated
};

// wall:select
Services.prototype.selectWall = function( id ) {
    var _this = this;

    return this._queries.getAllWalls()
        .then(function( walls ) {
            _this._interface.displayWallSelector( walls );

            return walls;
        });
};

// wall:display
// wall:created
Services.prototype.displayWall = function( id ) {
    var _this = this, wall;

    return this._queries.getWall( id )
        .then(function( resource ) {
            wall = resource;

            _this._interface.displayWall( wall );  // --> wall:displayed

            if ( !wall.boards.length ) {
                _this._interface.notifyWallFirstTime( wall );  // --> wall:firsttime
            }

            return _this.selectBoard( wall );
        })
        .then(function( boards ) {
            if (boards.length) {
                _this._interface.displayBoard( boards[0] );  // --> board:displayed
            }

            return wall;
        });
};

module.exports = Services;
