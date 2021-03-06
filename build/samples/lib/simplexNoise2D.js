/**
 *
 * Implementation
 * --------------
 *
 * The focus here is to demonstrate how it works, therefore I have
 * chosen not to use many of the shortcuts in the original implementation.
 *
 * The biggest performance hit would likely come from the use of arrays
 * to represent vectors. I found this a reasonable compromise to keep
 * the mathematics even remotely readable.
 *
 * If you are not even trying to read the code, you might try
 * [another JS implementation] by [Sean McCullough]. It also supports
 * 3D noise, which I have omitted here for brevity.
 *
 *   [another JS implementation]: https://gist.github.com/304522
 *   [Sean McCullough]: https://github.com/banksean
 *
 */
(function () {

    // 2-dimensional dot product of two vectors disguised as arrays.
    // Dot product is a very funny function, see [wikipedia].
    //   [wikipedia]: http://en.wikipedia.org/wiki/Dot_product
    function dot2D (a, b) {
        return a[0]*b[0] + a[1]*b[1];
    }

    // Changes the coordinate system (makes an [affine transformation])
    // by skewing it parallel to y=x+b. Think of it by grabbing a point on
    // the line y=x and dragging along the line.
    //   [affine transformation]: http://www.quantdec.com/GIS/affine.htm
    function skew45degree2D (x, y, factor) {
        var s = (x+y) * factor;
        return [x+s, y+s];
    }

    timotuominen.define("html5.simplexNoise.SimplexNoise2D", function(options) {
        options = options || {};

        // Considering we want to be able to skew the triangles in to a
        // rectangular grid, the height of a triangle has to be half the
        // length of the diagonal of the 1x1 square: sqrt(2)/2.
        // However, for most of the time we only need the square, which then is
        // (sqrt(2)/2)*(sqrt(2)/2)=1/2!
        //
        var TRIANGLE_HEIGHT_SQUARED = options.triangleHeightSquared || .5;

        // Calculate the skew factors that we use to switch between the
        // triangular and the rectangular grids.
        // FIXME: Magic formulas.
        var SKEW_PIXEL_TO_GRID_2D = (Math.sqrt(3) - 1) / 2;
        var SKEW_GRID_TO_PIXEL_2D = (Math.sqrt(3) - 3) / 6;

        // Create a set of pseudo random gradients.
        var gradientKernel = options.gradientKernel || new timotuominen.html5.simplexNoise.GradientKernel(options.random);

        // Given the vector from this corner of a triangle to the pixel at hand,
        // calculate how much it should effect. However, if the distance is
        // greater than the height of the triangle, don't do anything. Otherwise
        // we would end up with nasty artifacts, since then other triangles
        // than the one that contains this pixel should start to affect.
        function calculateEffect (delta, grad) {
            // Dot product of a vector onto itself yields the square of its
            // length. We can compare it to the square of the height of the
            // triangle to be fair.
            var magnitude = TRIANGLE_HEIGHT_SQUARED - dot2D(delta, delta);

            if (magnitude < 0) {
                // Too far, ignore this corner.
                return 0;
            } else {
                // The further we go, the weaker the effect becomes (magnitude is
                // always < 0.5). The dot product here gives takes into account the
                // direction of the gradient.
                return Math.pow(magnitude, 4) * dot2D(delta, grad);
            }
        }

        return {
            // Takes an xy-coordinate and returns the magnitude of the effect between -1 and 1.
            processPixel: function (xin, yin) {

                // Skew the coordinates onto the rectangular tile grid.
                var posOnTileGrid = skew45degree2D(xin, yin, SKEW_PIXEL_TO_GRID_2D);

                // Resolve the index _and_ origin of this tile--we are using tiles
                // of the size of 1.0 x 1.0. The function ~~ is only a faster Math.floor.
                var tileOrigin = [~~(posOnTileGrid[0]), ~~(posOnTileGrid[1])];

                // The position of the origin of the tile on the pixel grid, from which
                // we came. This is now actually one of the corners of the triangle on
                // which this pixel landed.
                var pixOrigin = skew45degree2D(tileOrigin[0], tileOrigin[1], SKEW_GRID_TO_PIXEL_2D);

                // Vector from the "origin" to the pixel we have.
                var pixDeltaFromOrigin = [xin-pixOrigin[0], yin-pixOrigin[1]];

                // Whether we are dealing with the upper left or lower right triangle of
                // the rectangular grid. We can do this even now that we are back to the
                // triangular grid, since the skew left all 45 degree lines untouched.
                var triangleFactor = pixDeltaFromOrigin[0] > pixDeltaFromOrigin[1] ? [1,0] : [0,1];

                // The distance from the upper left or lower right corner of the imaginary tile,
                // depending on on which of them our pixel is. "Imaginary" because when we are back
                // in the triangular grid, we don't really have tiles anymore, but we can still
                // identify the two triangles that made up the tile.
                var pixDeltaFromTriangleCorner = [
                    pixDeltaFromOrigin[0] - triangleFactor[0] - SKEW_GRID_TO_PIXEL_2D,
                    pixDeltaFromOrigin[1] - triangleFactor[1] - SKEW_GRID_TO_PIXEL_2D
                ];

                // Distance from the opposing corner of the tile. This is the same for both of
                // the triangles of our tile.
                var pixDeltaFromOpposingCorner = [
                    pixDeltaFromOrigin[0] - 1.0 + 2.0*-SKEW_GRID_TO_PIXEL_2D,
                    pixDeltaFromOrigin[1] - 1.0 + 2.0*-SKEW_GRID_TO_PIXEL_2D
                ];

                // Retrieve the set of three gradients for this triangle. We need both
                // tileOrigin and triangleFactor to identify the unique set.
                var cornerGradients = gradientKernel.getGradientsAt(tileOrigin, triangleFactor);

                // Count all the effects.
                var totalMagnitude = 0;
                totalMagnitude += calculateEffect(pixDeltaFromOrigin, cornerGradients[0]);
                totalMagnitude += calculateEffect(pixDeltaFromTriangleCorner, cornerGradients[1]);
                totalMagnitude += calculateEffect(pixDeltaFromOpposingCorner, cornerGradients[2]);

                // Scale the final effect to be on a scale from -1 to 1.
                // FIXME: 60 here is a magic number.
                return 60 * totalMagnitude;
            }
        };
    });
})();

//
// Little module to contain a fixed set of random gradients.
// Internally it has a list of possible gradients it uses.
//
// Takes a random function as an argument, which defaults to Math.random.
//
timotuominen.define("html5.simplexNoise.GradientKernel", function (random) {
    random = random || Math.random;

    var GRADIENTS_2D = [[1,1],[-1,1],[1,-1],[-1,-1],[0,1],[1,0],[0,-1],[-1,0]];
    var NUM_GRADIENTS_2D = GRADIENTS_2D.length;

    // Initialize a list of random numbers to use, each from 0 to 256.
    var randomKernel = [];
    for(var i = 0; i < 512; i++) {
        randomKernel[i] = ~~(random()*256);
    }

    return {
        // Takes the xy index of a tile on the rectangular grid,
        // as well as a triangleFactor that determines on which
        // of the two triangles of the tile we are.
        getGradientsAt: function (tileIndex, triangleFactor) {

            // We only have so many random numbers generated,
            // if an an index exceeds 255, start from 0 again.
            var ii = tileIndex[0] % 255;
            var jj = tileIndex[1] % 255;

            // A hash function that gets a random gradient for each of the
            // corners, but one that also ascertains the gradient is the same
            // for all triangles which share the same corner.
            var index0 = randomKernel[ii+randomKernel[jj]];
            var index1 = randomKernel[ii+triangleFactor[0]+randomKernel[jj+triangleFactor[1]]];
            var index2 = randomKernel[ii+1+randomKernel[jj+1]];
            return [
                GRADIENTS_2D[index0 % NUM_GRADIENTS_2D],
                GRADIENTS_2D[index1 % NUM_GRADIENTS_2D],
                GRADIENTS_2D[index2 % NUM_GRADIENTS_2D]
            ];
        }
    };
});
