var CanvasBoard = require('./shapes/board')
  , CanvasCard = require('./shapes/card')
  , CanvasRegion = require('./shapes/region');


function UI( queue, $element, options, $ ) {
    this._queue = queue;

    this._$element = $element;

    this._size = {
        height: $(window).innerHeight(),
        width: $(window).innerWidth()
    };

    this.constructor = UI;

    var clicks = [ 'new', 'edit', 'select', 'display', 'unlink' ];

    // e.g. on click or touch for [data-new="wall"] trigger 'wall:new' with id
    // e.g. on click or touch for [data-edit="board"] trigger 'board:edit' with id

    clicks.forEach(function( task ) {
        $element.on( 'click touch', '[data-'+ task +']', function( ev ) {
            ev.preventDefault();

            var type = $(this).data( task );

            var target = $(this).data( type ) || $(this).data('parent') || ( $(this).attr('href') || '' ).replace('#', '');

            queue.trigger( type + ':' + task, target );
        });
    });

    var submits = [ 'create', 'update' ];

    // e.g. on submit for [data-create="wall"] trigger 'wall:new' with ev

    submits.forEach(function( task ) {
        $element.on( 'submit', '[data-'+ task +']', function( ev ) {
            ev.preventDefault();

            var data = {};
            var a = $(this).serializeArray();
            a.forEach(function( pair ) {
                var key = pair.name, value = pair.value;

                if (data[key] !== undefined) {
                    if (!data[key].push) {
                        data[key] = [data[key]];
                    }
                    data[key].push(value || '');
                } else {
                    data[key] = value || '';
                }
            });

            queue.trigger( $(this).data( task ) + ':' + task, data );
        });
    });
}

UI.prototype.displayBoard = function( board ) {
    var viewer = '<div id="'+ board.getId() +'" class="tab-content" data-viewer="board"></div>';

    this._$element.find('[data-viewer="board"]').replaceWith( viewer );

    this._canvasboard = new CanvasBoard( this._queue, board, this._size );
    this._canvascards = [];
    this._canvasregions = [];
};

UI.prototype.displayBoardCreator = function( wall ) {
    this._boardcreator = this._boardcreator || this._$element.find('[data-create="board"]');

    this._boardcreator[0].reset();
    this._boardcreator.find('[name="wall"]').val( wall.getId() );

    this._boardcreator.modal( 'show' );
};

UI.prototype.displayBoardEditor = function( board ) {
    this._boardeditor = this._boardeditor || this._$element.find('[data-update="board"]');

    this._boardeditor[0].reset();
    this._boardeditor.find('[name="id"]').val( board.getId() );
    this._boardeditor.find('[name="name"]').val( board.getName() );
    this._boardeditor.find('[name="transform"]').val( board.getWall() );
    this._boardeditor.find('[name="wall"]').val( board.getWall() );

    this._boardeditor.modal( 'show' );
};

UI.prototype.displayBoardSelector = function( wall, boards ) {
    var selector = this._$element.find('[data-selector="board"]');

    var options = boards.map(function( board ) {
        return '<li><a href="#'+ board.getId() +'" data-display="board">'+ board.getName() +'</a></li>';
    });

    options.push('<li><button type="button" class="btn btn-default" data-new="board" data-parent="'+ wall.getId() +'" title="Add Board"><i class="glyphicon glyphicon-plus"></i></button></li>');

    selector.empty().append( options.join('') );
};

UI.prototype.updateBoardSelector = function( board ) {
    var selector = this._$element.find('[data-selector="board"]');

    selector.find('.active').removeClass('active');

    $('<li><a href="#'+ board.getId() +'" data-display="board">'+ board.getName() +'</a></li>')
        .appendBefore( selector.children().last() );
};

// cardlocations

UI.prototype.displayCardLocation = function( cardlocation, pocket ) {
    var canvascard = new CanvasCard( this._queue, cardlocation, pocket );

    this._canvasboard.addCard( canvascard );
};

UI.prototype.displayPocketCreator = function( wall ) {
    this._pocketcreator = this._pocketcreator || this._$element.find('[data-create="pocket"]');

    this._pocketcreator[0].reset();
    this._pocketcreator.find('[name="wall"]').val( wall.getId() );

    this._pocketcreator.modal( 'show' );
};

UI.prototype.displayPocketEditor = function( pocket ) {
    this._pocketeditor = this._pocketeditor || this._$element.find('[data-update="pocket"]');

    this._pocketeditor[0].reset();
    this._pocketeditor.find('[name="id"]').val( pocket.getId() );
    this._pocketeditor.find('[name="title"]').val( pocket.getTitle() );
    this._pocketeditor.find('[name="content"]').val( pocket.getContent() );
    this._pocketeditor.find('[name="tags"]').val( pocket.getTags() );
    this._pocketeditor.find('[name="mentions"]').val( pocket.getMentions() );
    this._pocketeditor.find('[name="wall"]').val( pocket.getWall() );

    this._pocketeditor.modal( 'show' );
};

// regions

UI.prototype.displayRegion = function( region ) {
    var canvasregion = new CanvasRegion( this._queue, region );

    this._canvasboard.addRegion( canvasregion );
};

UI.prototype.displayRegionCreator = function( board ) {
    this._regioncreator = this._regioncreator || this._$element.find('[data-create="region"]');

    this._regioncreator[0].reset();
    this._regioncreator.find('[name="board"]').val( board.getId() );

    this._regioncreator.modal( 'show' );
};

UI.prototype.displayRegionEditor = function( region ) {
    this._regioneditor = this._regioneditor || this._$element.find('[data-update="region"]');

    this._regioneditor[0].reset();
    this._regioneditor.find('[name="id"]').val( region.getId() );
    this._regioneditor.find('[name="label"]').val( region.getLabel() );
    this._regioneditor.find('[name="value"]').val( region.getValue() );
    this._regioneditor.find('[name="color"]').val( region.getColor() );
    this._regioneditor.find('[name="board"]').val( region.getBoard() );

    this._regioneditor.modal( 'show' );
};

// walls

UI.prototype.displayWall = function( wall ) {
    var viewer = $('<div id="'+ wall.getId() +'" class="container" data-viewer="wall"> \
            <ul data-selector="board" class="nav nav-tabs"></ul> \
            <div class="tab-content" data-viewer="board"></div> \
        </div>');

    this._$element.find('[data-viewer="wall"]').replaceWith( viewer );
};

UI.prototype.displayWallCreator = function() {
    this._wallcreator = this._wallcreator || this._$element.find('[data-create="wall"]');

    this._wallcreator[0].reset();

    this._wallcreator.modal( 'show' );
};

UI.prototype.displayWallEditor = function( wall ) {
    this._walleditor = this._walleditor || this._$element.find('[data-update="wall"]');

    this._walleditor[0].reset();
    this._walleditor.find('[name="id"]').val( wall.getId() );
    this._walleditor.find('[name="name"]').val( wall.getName() );

    this._walleditor.modal( 'show' );
};

UI.prototype.displayWallSelector = function( walls ) {
    this._wallselector = this._wallselector || this._$element.find('[data-selector="wall"]');

    var options = walls.map(function( wall ) {
        return '<a href="#'+ wall.getId() +'" class="list-group-item" data-display="wall" data-dismiss="modal">'+ wall.getName() +'</a>';
    });

    this._wallselector.find('[data-options="list"]').empty().append( options.join('') );

    this._wallselector.modal( 'show' );
};

// controls

UI.prototype.enableControls = function() {
    this._$element.find('[data-new]:disabled').removeAttr( 'disabled' );
};

module.exports = UI;
