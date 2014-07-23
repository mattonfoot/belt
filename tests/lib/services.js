var RSVP = require('rsvp')
  , Promise = RSVP.Promise;

// Application

function Services( interface, commands, queries ) {
    this._commands = commands;
    this._queries = queries;
    this._interface = interface;
}

// board:new
Services.prototype.newBoard = function( ev ) {
    this._interface.displayBoardCreator();
};

// board:create
Services.prototype.createBoard = function( ev ) {
    var _this = this, board;

    return this._interface
        .extractAddBoardData( ev )
        .then(function( data ) {
            return _this._commands.createBoard( data );  // --> board:created
        })
        .then(function( resource ) {
            board = resource;

            return _this._queries.getWall( board.getWall() );
        })
        .then(function( wall ) {
            return _this._queries.getPockets( wall.getPockets() );
        })
        .then(function( pockets ) {
            _this._commands.addPocketsToBoard( board, pockets );  // --> card:created

            return board;
        });
};

// board:edit
Services.prototype.editBoard = function( ev ) {
    var _this = this;

    return this._interface
        .extractTargetId( ev )
        .then(function( id ) {
            return _this._queries.getBoard( id );
        })
        .then(function( board ) {
            _this._interface.displayBoardEditor( board );

            return board;
        });
};

// board:update
Services.prototype.updateBoard = function( ev ) {
    var _this = this;

    return this._interface
        .extractModifyBoardData( ev )
        .then(function( data ) {
            return _this._commands.updateBoard( data );  // --> board:updated
        });
};

// board:display
Services.prototype.displayBoard = function( ev ) {
    var _this = this;

    return this._interface
        .extractTargetId( ev )
        .then(function( id ) {
            return _this._queries.getBoard( id );
        })
        .then(function( board ) {
            _this._interface.displayBoard( board );  // --> board:displayed

            return board;
        });
};

// card:move
Services.prototype.moveCard = function( ev ) {
var _this = this, info;

return this._interface
    .extractMoveCardData( ev )
    .then(function( data ) {
        info = data;

        return _this.queries.getCard( info.id );
    })
    .then(function( card ) {
        if ( card.x != info.x || card.y != info.y ) {
          card.x = info.x;
          card.y = info.y;

          return _this._commands.updateCard( card );  // --> card:updated
        }
    });
};

// pocket:new
Services.prototype.newPocket = function( ev ) {
    this._interface.displayPocketCreator();
};

// pocket:create
Services.prototype.createPocket = function( ev ) {
    var _this = this, pocket;

    return this._interface
        .extractAddPocketData( ev )
        .then(function( data ) {
            return _this._commands.createPocket( data );  // --> pocket:created
        })
        .then(function( resource ) {
            pocket = resource;

            return _this._queries.getWall( pocket.getWall() );
        })
        .then(function( wall ) {
            return _this._queries.getBoards( wall.getBoards() );
        })
        .then(function( boards ) {
            _this._commands.addPocketToBoards( boards, pocket );  // --> card:created

            return pocket;
        });
};

// pocket:edit
Services.prototype.editPocket = function( ev ) {
    var _this = this;

    return this._interface
        .extractTargetId( ev )
        .then(function( id ) {
            return _this._queries.getPocket( id );
        })
        .then(function( pocket ) {
            _this._interface.displayPocketEditor( pocket );

            return pocket;
        });
};

// pocket:update
Services.prototype.updatePocket = function( ev ) {
    var _this = this;

    return this._interface
        .extractModifyPocketData( ev )
        .then(function( data ) {
            return _this._commands.updatePocket( data );  // --> pocket:updated
        });
};

// region:new
Services.prototype.newRegion = function( ev ) {
    this._interface.displayRegionCreator();
};

// region:create
Services.prototype.createRegion = function( ev ) {
    var _this = this;

    return this._interface
        .extractAddRegionData( ev )
        .then(function( data ) {
            return _this._commands.createRegion( data );  // --> region:created
        });
};

// region:edit
Services.prototype.editRegion = function( ev ) {
    var _this = this;

    return this._interface
        .extractTargetId( ev )
        .then(function( id ) {
            return _this._queries.getRegion( id );
        })
        .then(function( region ) {
            _this._interface.displayRegionEditor( region );

            return region;
        });
};

// region:move
Services.prototype.moveRegion = function( ev ) {
  var _this = this, info;

  return this._interface
      .extractMoveRegionData( ev )
      .then(function( data ) {
          info = data;

          return _this.queries.getRegion( info.id );
      })
      .then(function( region ) {
          if ( region.x != info.x || region.y != info.y ) {
            region.x = info.x;
            region.y = info.y;

            return _this._commands.updateRegion( region );  // --> region:updated
          }
      });
};

// region:resize
Services.prototype.resizeRegion = function( ev ) {
  var _this = this, info;

  return this._interface
      .extractResizeRegionData( ev )
      .then(function( data ) {
          info = data;

          return _this.queries.getRegion( info.id );
      })
      .then(function( region ) {
          if ( region.height != info.height || region.width != info.width ) {
            region.height = info.height;
            region.width = info.width;

            return _this._commands.updateRegion( region );  // --> region:updated
          }
      });
};

// region:update
Services.prototype.updateRegion = function( ev ) {
  var _this = this;

  return this._interface
      .extractModifyRegionData( ev )
      .then(function( data ) {
          return _this._commands.updateRegion( data );  // --> region:updated
      });
};

// wall:new
Services.prototype.newWall = function( ev ) {
    this._interface.displayWallCreator();
};

// wall:create
Services.prototype.createWall = function( ev ) {
    var _this = this;

    return this._interface
        .extractAddWallData( ev )
        .then(function( data ) {
            return _this._commands.createWall( data ); // --> wall:created
        });
};

// wall:edit
Services.prototype.editWall = function( ev ) {
    var _this = this;

    return this._interface
        .extractTargetId( ev )
        .then(function( id ) {
            return _this._queries.getWall( id );
        })
        .then(function( wall ) {
            _this._interface.displayWallEditor( wall );

            return wall;
        });
};

// wall:update
Services.prototype.updateWall = function( ev ) {
    var _this = this;

    return this._interface
        .extractModifyWallData( ev )
        .then(function( data ) {
            return _this._commands.updateWall( data );  // --> wall:updated
        });
};

// wall:select
Services.prototype.selectWall = function( ev ) {
    var _this = this;

    return this._interface
        .preventDefault( ev )
        .then(function( ev ) {
            return _this._queries.getWalls();
        })
        .then(function( walls ) {
            _this._interface.displayWallSelector( walls );

            return walls;
        });
};

// wall:display
Services.prototype.displayWall = function( ev ) {
    var _this = this;

    return this._interface
        .extractTargetId( ev )
        .then(function( id ) {
            return _this._queries.getWall( id );
        })
        .then(function( wall ) {
            _this._interface.displayWall( wall );  // --> wall:display

            if ( !wall.boards.length ) {
                _this._interface.notifyWallFirstTime( wall );  // --> wall:firsttime
            }

            return wall;
        })
        .then(function( boards ) {
            _this._interface.displayBoardSelector( boards );

            return boards;
        });
};

// transform:unlink
Services.prototype.unlinkTransform = function( ev ) {
    var _this = this;

    return this._interface
        .extractTargetId( ev )
        .then(function( id ) {
            return _this._queries.getTransform( id );
        })
        .then(function( transform ) {
            return _this._commands.unlinkTransform( id );  // --> transform:unlinked
        })
        .then(function( transform ) {
            _this._interface.removeTransform( transform );

            return transform;
        });
};

// board:select
Services.prototype.selectBoard = function( wall ) {
    return this._queries
        .getBoards( wall.getBoards() )
        .then(function( boards ) {
            return _this._interface.displayBoardSelector( boards );  // --> boardselector:displayed
        })
        .then(function( boards ) {
            _this._interface.displayBoard( boards[0] );  // --> board:displayed

            return boards[0];
        });
};

// board:displayed
Services.prototype.displayCards = function( board ) {
    return this._queries
        .getCards( board.getCards() )
        .then(function( cards ) {
            _this._interface.displayCards( cards );  // --> card:displayed

            return cards;
        });
};

// board:displayed
Services.prototype.displayRegions = function( board ) {
    return this._queries
        .getRegions( board.getRegions() )
        .then(function( regions ) {
            _this._interface.displayRegions( regions );  // --> region:displayed

            return regions;
        });
};

module.exports = Services;
