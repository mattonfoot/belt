// defaults

var handleSize = 20;

var colors = {
  fill: '#aaa'
};

var shadow = {
  color: '#eee',
  offset: { active: 1, inactive: 0 },
  blur: { active: 5, inactive: 0 }
};

// constructor

function CanvasRegion( queue, region ) {
    var shape = new Kinetic.Group({
        id: region.getId(),
        x: region.getX() || 5,
        y: region.getY() || 5,
        draggable: true
    });
    var color = __asColor( region.getColor() );
    var resizing = false;

    var background = __createBackground( region.getWidth(), region.getHeight(), color || colors.fill, shadow.color );
    var handle = __createHandle( region.getWidth(), region.getHeight() );
    var title = __createTitleText( region.getWidth(), region.getLabel() );

    shape.add( background );
    shape.add( title );
    shape.add( handle );

    // triggers

    queue
      .on( 'region:updated', function( data ) {
        if ( region.id === data.id ) {
          __moveTo( data.x, data.y );
          __resizeTo( data.width, data.height );
          __UpdateDisplay( data );
        }
      });

    shape
      .on('mousedown touchstart', function() {
        __displayActiveState();

        queue.trigger( 'region:activate', region );
      })
      .on('mouseup touchend', function() {
        __displayInactiveState();

        queue.trigger( 'region:deactivate', region );
      })
      .on('dragend', function() {
        queue.trigger( 'region:move', { id: region.getId(), x: shape.getX(), y: shape.getY() } );
      })
      .on('dblclick dbltap', function( e ) {
        e.cancelBubble = true;
        shape.getStage().preventEvents = true;

        queue.trigger( 'region:edit', region.getId() );
      });

    handle
      .on('mousedown touchstart', function() {
        resizing = true;
      })
      .on('mouseup touchend', function() {
        resizing = false;
      })
      .on('dragmove', function( evt ) {
        evt.cancelBubble = true;

        var width = handle.getX() + ( handleSize / 2 );
        var height = handle.getY() + ( handleSize / 2 );

        __resizeTo( width, height );
      })
      .on('dragend', function( evt ) {
        evt.cancelBubble = true;

        queue.trigger( 'region:resize', { id: region.getId(), width: background.getWidth(), height: background.getHeight() } );
      });

    // private methods

    function __createBackground( w, h, fill, shadow ) {
      return new Kinetic.Rect({
        x: 0,
        y: 0,
        width: w,
        height: h,
        fill: fill,
        opacity: 0.1,
        shadowOpacity: 0.5,
        shadowColor: shadow
      });
    }

    function __createTitleText( w, title ) {
      return new Kinetic.Text({
        x: 5,
        y: 5,
        width: w - 10,
        text: title,
        fontSize: 16,
        fontFamily: 'Calibri',
        fontWeight: 600,
        fill: '#666',
        align: 'center'
      });
    }

    function __createHandle( w, h ) {
      return new Kinetic.Rect({
        x: w - ( handleSize / 2 ),
        y: h - ( handleSize / 2 ),
        width: handleSize,
        height: handleSize,
        stroke: '#ddd',
        strokeWidth: 2,
        cornerRadius: ( handleSize / 2 ),
        opacity: 0,
        draggable: true
      });
    }

    function __redrawLayer() {
      try {
        var layer = shape.getLayer();

        if (layer) {
          layer.batchDraw();
        }
      } catch(e) {
      }
    }

    function __UpdateDisplay( data ) {
      title.setText( data.label || "" );

      color = __asColor( data.color );

      background.setFill( color || colors.fill );

      __redrawLayer();
    }

    function __asColor( color ) {
      if ( color ) {
        return color;
      }

      return;
    }

    function __displayActiveState() {
      background.setShadowBlur( shadow.blur.active );
      background.setShadowOffset( shadow.offset.active );

      handle.setOpacity( 1 );

      shape.moveToTop();

      __redrawLayer();

      return shape;
    }

    function __displayInactiveState() {
      background.setShadowBlur( shadow.blur.inactive );
      background.setShadowOffset( shadow.offset.inactive );

      handle.setOpacity( 0 );

      __redrawLayer();

      return shape;
    }

    function __moveTo( x, y ) {
      shape.moveToTop();

      shape.setX( x );
      shape.setY( y );

      __redrawLayer();
    }

    function __resizeTo( width, height ) {
      shape.moveToTop();

      background.size({ width: width, height: height });
      title.setWidth( width - 10 );

      __redrawLayer();
    }

    __displayInactiveState();

    // instance

    return shape;
}

module.exports = CanvasRegion;
