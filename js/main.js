// FIXME put the constants somewhere sensible
var k = 1;
var vel = 2;
var gestation = 2;
var nagSize = 2;
var useNiche = true;
var nicheWidth = 200;
var nicheAreaSize = 5;
var numNags = 10;

var random = new PcgRandom(Date.now());
var canvas;

var main = function () {
	canvas = document.querySelector("#world");
  canvas.width = document.documentElement.clientWidth-20;
  canvas.height = document.documentElement.clientHeight-20;
	var context = canvas.getContext("2d");
	var w = new World(context);
	w.run();
};

var World = function (context) {
	this.init(context);
};

World.prototype = {
	init: function (context) {
		this.context = context;
		this.width = context.canvas.width;
		this.height = context.canvas.height;
		this.timestep = 0;
		this.populateNagList();
	},

	populateNagList: function () {
		this.nagList = [];
		// FIXME get this init conditions to match the paper better
		//this.nagList.push(new Nag(0, 0.00, 0, 0, 0, { x:40, y:250 }, Math.PI/2))
		//this.nagList.push(new Nag(0, 0.05, 0, 0, 0, { x:80, y:250 }, Math.PI/2))
		//this.nagList.push(new Nag(0, 0.1, 0, 0, 0, { x:120, y:250 }, Math.PI/2))
		//this.nagList.push(new Nag(0, 0.15, 0, 0, 0, { x:160, y:250 }, Math.PI/2))
		//this.nagList.push(new Nag(0, 0.2, 0, 0, 0, { x:200, y:250 }, Math.PI/2))
		//this.nagList.push(new Nag(0, 0.5, 0, 0, 0, { x:240, y:250 }, Math.PI/2))
		//this.nagList.push(new Nag(0, 0.8, 0, 0, 0, { x:280, y:250 }, Math.PI/2))
		//this.nagList.push(new Nag(0, 1, 0, 0, 0, { x:320, y:250 }, Math.PI/2))
		for (var i = 0; i < numNags; ++i) {
      this.nagList.push(new Nag(
        0, // curvature
        0.5*random.number(), // irrationality
        0.8+0.2*random.number(), // fecundity,
        0*random.number(), // mortality
        (random.number()-0.5)*Math.PI*2, // offset
        0.1*random.number(), // niche
        { x: random.number()*this.width, y: random.number()*this.height }, // position
        random.number()*Math.PI*2)); // rotation
		}
	},

	step: function () {
		if (this.nagList.length > 0) {
			requestAnimationFrame(this.step.bind(this));
			var newNagList = [];
			var imgData = this.context.getImageData(0,0, this.width, this.height).data;
			for (var i = 0; i < this.nagList.length; i++) {
				// get the current nag
				var nag = this.nagList[i];
				nag.iteratePosition();
				// whatever nags come back from the update call,
				// aggregate them into our new list of nags.

				var nags = nag.surviveAndBreed(imgData);

				// if it's old enough, we draw it
				if (nag.age > gestation) {
					this.context.fillRect(nag.p.x, nag.p.y, nagSize, nagSize);
				}
				while (nags.length > 0) {
					newNagList.push(nags.pop());
				}
			}
			this.nagList = newNagList;
			//console.log("this timestep is:", this.timestep++);
			//console.log("the nags are:", this.nagList);
      let avgF = this.nagList.reduce((sum, nag) => { return sum += nag.f }, 0)/this.nagList.length;
      let avgNiche = this.nagList.reduce((sum, nag) => { return sum += nag.delta }, 0)/this.nagList.length;
      let avgM = this.nagList.reduce((sum, nag) => { return sum += nag.m }, 0)/this.nagList.length;
      console.log("f", avgF.toFixed(2), "m", avgM.toFixed(2), "niche", avgNiche.toFixed(4))
		}
	},

	run: function () {
		this.step();
	}
};

var Nag = function (ro, r, f, m, phi, delta, pos, theta) { // curvature, irrationality, fecundity, mortality, offset, niche
	this.init(ro, r, f, m, phi, delta, pos, theta);
};

Nag.prototype = {
	init: function (ro, r, f, m, phi, delta, pos, theta) {
		// the genome
		this.ro = this.bound(ro, -1, 1);
		this.r =  this.bound(r, 0, 1);
		this.f =  this.bound(f, 0, 1);
		this.m =  this.bound(m, 0, 1);
		this.phi = phi;
    this.delta = this.bound(delta, 0, 1);
		// end genome

		this.p = {
			x: pos.x,
			y: pos.y
		};
		this.theta = theta;
		this.dthetadt = 0;

		// a baby!
		this.age = 0;
	},

	surviveAndBreed: function (imgData) {
    var probs = this.deathAndReproductionProb(imgData);
		// die?
		if (this.outOfBounds() ||
				this.collision(imgData) ||
				random.number() < probs.death) {
      //console.log("niche was:", this.delta);
			return [];
		} else {
			this.returnedNags = [this];
		}
		// reproduce?
		if (random.number() < probs.reproduction) {
			this.returnedNags.push(this.bearOffspring());
		}
		// get older
		this.age++;

		return this.returnedNags;
	},

  deathAndReproductionProb: function (imgData) {
    if (useNiche) {
      let differenceFromPreference = this.localDensity(imgData)-this.delta;
      var nicheFactor = Math.pow(
        Math.cos(this.bound(
          2*Math.PI*(differenceFromPreference),
          -Math.PI/2,
          Math.PI/2
        )),
        nicheWidth
      )
      return {
        death: this.m * (1-nicheFactor),
        reproduction: this.f * nicheFactor,
        nicheFactor: nicheFactor
      };
    } else {
      return {
        death: this.m,
        reproduction: this.f
      };
    }
  },

	// attempt at the fracSum function described in the paper. I assum the second argument
	// to the function is determining the number of octaves, but I could be totally wrong.
	fracSum: function (p, octaves) {
		PerlinSimplex.noiseDetail(Math.floor(octaves), 0.5);
		return PerlinSimplex.noise(p.x, p.y);
	},

	// returns a random float drawn from an approximate standard normal distribution
	// as per the central limit theorem (std. dev. 1, mean 0)
	normalDistRand: function () {
    sample = (
      random.number() + random.number() + random.number() +
      random.number() + random.number() + random.number() -
      3
    ) / 3;
    // console.log(sample)
    return sample;
	},

	bound: function (num, min, max) {
		return Math.max(Math.min(num, max), min);
	},

  // using 4 pixels on the canvas that the nag is over, determines if the
  // nag is colliding with a line
	collision: function (data) {
		var p1 = data[4*canvas.width*Math.floor(this.p.y)+4*Math.floor(this.p.x)+3];
		var p2 = data[4*canvas.width*Math.floor(this.p.y)+4*Math.ceil(this.p.x)+3];
		var p3 = data[4*canvas.width*Math.ceil(this.p.y)+4*Math.floor(this.p.x)+3];
		var p4 = data[4*canvas.width*Math.ceil(this.p.y)+4*Math.ceil(this.p.x)+3];
		let nextX = this.p.x + vel*Math.cos(this.theta);
		let nextY = this.p.y + vel*Math.sin(this.theta);
    // console.log(p1, p2, p3, p4);
		// 500 is arbitrary
		return (p1+p2+p3+p4)>255;
	},

  // returns the ratio of 'inked' area to total area around the nag. "area around
  // the nag" is a square with side length given by the global constant nicheAreaSize
  localDensity: function (data) {
    xStart = Math.floor(this.p.x-nicheAreaSize/2);
    xEnd = Math.ceil(this.p.x+nicheAreaSize/2);
    yStart = Math.floor(this.p.y-nicheAreaSize/2);
    yEnd = Math.ceil(this.p.y+nicheAreaSize/2);
    var totalArea = 0;
    // since a single "black pixel" is sometimes averaged over multiple pixels, we'll
    // try adding up the total opacity within the area, and getting a count by
    // dividing by 255
    var inkedOpacityCount = 0;
    for (var x = xStart; x < xEnd; x++) {
      for (var y = yStart; y < yEnd; y++) {
        for (var z = 0; z < 4; z++) {
          inkedOpacityCount += data[4*canvas.width*y+4*x+z];
        }
        totalArea++;
      }
    }
    var density = (inkedOpacityCount / 255) / totalArea;
    // console.log(density);
    return density;
  },

	outOfBounds: function () {
		if (this.p.x < 0 || this.p.y < 0 || this.p.x > canvas.width || this.p.y > canvas.height) {
			return true;
		} else {
			return false;
		}
	},

	bearOffspring: function () {
/*
		return new Nag(this.ro+this.normalDistRand(),
									 this.r+this.normalDistRand(),
									 this.f+this.normalDistRand(),
									 this.m+this.normalDistRand(),
									 this.phi+this.normalDistRand(),
                   this.delta+this.normalDistRand(),
									 this.p,
									 this.theta+this.phi);
*/
		return new Nag(this.ro+this.normalDistRand()*0.02,
									 this.r+this.normalDistRand()*0.02,
									 this.f+this.normalDistRand()*0.5,
									 this.m+this.normalDistRand()*0.5,
									 this.phi+this.normalDistRand()*0.02,
                   this.delta+this.normalDistRand()*0.6,
									 this.p,
									 this.theta+this.phi);
	},

	// update the Nag's position based on its heading (theta) and current position.
	// coordinate space used has the 0 heading pointing ->, and positive increase
	// in heading goes counterclockwise, like graph quadrants.
	iteratePosition: function () {
		// set new curvature
		// k is a global constant. see formula (1) in the paper. TODO set k
		//this.dthetadt = this.ro + Math.pow(this.fracSum(this.p, k*this.r), 0.89*Math.pow(this.r, 2));
		this.dthetadt = this.ro + this.normalDistRand()*this.r;
		// FIXME Arbitrarily bounding dthetadt by -1 and 1 rads/frame
    // this.dthetadt = this.bound(this.dthetadt, -1, 1);

		// update the heading and position of the nag
		this.theta += this.dthetadt;
		this.p.x += vel*Math.cos(this.theta);
		this.p.y += vel*Math.sin(this.theta);
	}
}

window.onload = main;
