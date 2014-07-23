
function UI( queue, $element, options ) {
    this._queue = queue;

    this._$element = $element;

    this.constructor = UI;

    var listeners = [ 'new', 'create', 'edit', 'update', 'select', 'display', 'unlink' ];

    // e.g. on click or touch for [data-new="wall"] trigger 'wall:new' with ev
    // e.g. on click or touch for [data-update="board"] trigger 'board:update' with ev

    listeners.forEach(function( task ) {
        $element.on( 'click touch', '[data-'+ task +']', function( ev ) {
            queue
                .trigger( this.data( task ) + ':' + task, ev );
        });
    });

    var displays = [ 'Board', 'Wall', 'WallSelector', 'BoardSelector' ];

    var _this = this;

    displays.forEach(function( display ) {
        queue
            .on( display.toLowerCase() + ':display', function( data ) {
                _this[ 'display' + display ]( data );
            })
            .on( display.toLowerCase() + ':add', function( data ) {
                _this[ 'add' + display ]( data );
            });
    });
}

UI.prototype = {

    constructor: UI,

    addBoard: function( board ) {
        $('<li><a href="#'+ board.getId() +'" data-display="board">'+ board.getName() +'</a></li>')
            .appendBefore( this._$element.find('[data-selector="board"]').children().last() );

        this._queue.trigger( 'board:added', board );
    },

    displayBoard: function( board ) {
        var viewer = '<div id="'+ board.getId() +'" class="tab-content" data-viewer="board"></div>';

        this._$element.find('[data-viewer="board"]').replaceWith( viewer );

        this._board = board;
        this._canvasboard = new CanvasBoard( this.queue, board, this.size );

        this._queue.trigger( 'board:displayed', board );
    },

    displayWall: function( wall ) {
        var viewer = $('<div id="'+ wall.getId() +'" class="container" data-viewer="wall"> \
                <ul data-selector="board" class="nav nav-tabs"> \
                    <li><button type="button" class="btn btn-default" data-new="board" title="Add Board"><i class="glyphicon glyphicon-plus"></i></button></li> \
                </ul> \
                <div class="tab-content" [data-viewer="board"]></div> \
            </div>');

        this._$element.find('[data-viewer="wall"]').replaceWith( viewer );

        this._wall = wall;
        delete this._board;

        this._queue.trigger( 'wall:displayed', board );
    },

    displayWallSelector: function( walls ) {
        var options = walls.map(function( wall ) {
            return '<a href="#'+ wall.getId() +'" data-display="wall" class="list-group-item">'+ wall.getName() +'</a>';
        });

        this._$element.find('[data-selector="wall"]').empty().append( options.join('') );

        this._queue.trigger( 'wallselector:displayed', board );
    },

    displayBoardSelector: function( boards ) {
        var options = boards.map(function( board ) {
            return '<li><a href="#'+ board.getId() +'" data-display="board">'+ board.getName() +'</a></li>';
        });

        options.push('<li><button type="button" class="btn btn-default" data-new="board" title="Add Board"><i class="glyphicon glyphicon-plus"></i></button></li>');

        this._$element.find('[data-selector="board"]').empty().append( options.join('') );

        this._queue.trigger( 'boardselector:displayed', board );
    },

    // controls

    enableControls: function( data ) {
        this._$element.find('[data-new]:disabled').removeAttr( 'disabled' );

        this._queue.trigger( 'controls:enabled' );
    }

};

module.exports = UI;
