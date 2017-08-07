const Canvas = require('canvas');
const path = require('path');
const fs = require('fs');
const _ = require('lodash');
const PcgRandom = require('./js/lib/pcg-random/pcg-random');

let VEL = 2;
let GESTATION = 2;
let NAG_SIZE = 2;
let USE_NICHE = true;
let NICHE_WIDTHS = [100, 200];
let NICHE_WIDTH;
let NICHE_AREA_SIZES = [5, 10, 20, 40];
let NICHE_AREA_SIZE;
let NUM_NAGS = 10;
let MUTATION_SEVERITIES = [0.1, 0.5, 1];
let MUTATION_SEVERITY;

let random = new PcgRandom(Date.now());
let canvas;

// returns a random float drawn from an approximate standard normal distribution
// as per the central limit theorem (std. dev. 1, mean 0)
const normalDistRand = function () {
  sample = (
    random.number() + random.number() + random.number() +
    random.number() + random.number() + random.number() -
    3
  ) / 3;
  return sample;
}

let main = function () {
  _.forEach(NICHE_WIDTHS, (width) => {
    _.forEach(NICHE_AREA_SIZES, (size) => {
      _.forEach(MUTATION_SEVERITIES, (severity) => {
        NICHE_WIDTH = width;
        NICHE_AREA_SIZE = size;
        MUTATION_SEVERITY = severity;
        canvas = new Canvas(1000, 1000);
        let context = canvas.getContext("2d");
        let w = new World(context);
        w.run();
        fileId = [width, size, severity].join('_');
        let filePath = path.resolve(process.cwd(), 'images', `output_${fileId}.png`);
        fs.writeFileSync(filePath, canvas.toBuffer());
      });
    });
  });
};

let World = function (context) {
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
		for (let i = 0; i < NUM_NAGS; ++i) {
      this.nagList.push(new Nag(
        0, // curvature
        0.5*random.number(), // irrationality
        0.3+0.2*random.number(), // fecundity,
        0.1*random.number(), // mortality
        (random.number()-0.5)*Math.PI*2, // offset
        0, // niche
        { x: random.number()*this.width, y: random.number()*this.height }, // position
        random.number()*Math.PI*2)); // rotation
		}
	},

	step: function () {
		if (this.nagList.length > 0) {
			let newNagList = [];
			let imgData = this.context.getImageData(0,0, this.width, this.height).data;
			for (let i = 0; i < this.nagList.length; i++) {
				// get the current nag
				let nag = this.nagList[i];
				nag.iteratePosition();

				let nags = nag.surviveAndBreed(imgData);

				// if it's old enough, we draw it
				if (nag.age > GESTATION) {
					this.context.fillRect(nag.p.x, nag.p.y, NAG_SIZE, NAG_SIZE);
				}

        newNagList.push(...nags)
			}
			this.nagList = newNagList;
      let avgF = this.nagList.reduce((sum, nag) => { return sum += nag.f }, 0)/this.nagList.length;
      let avgNiche = this.nagList.reduce((sum, nag) => { return sum += nag.delta }, 0)/this.nagList.length;
      let avgM = this.nagList.reduce((sum, nag) => { return sum += nag.m }, 0)/this.nagList.length;
		}
	},

	run: function () {
    while (this.nagList.length > 0) {
      this.step();
    }
	}
};

let Nag = function (ro, r, f, m, phi, delta, pos, theta) { // curvature, irrationality, fecundity, mortality, offset, niche
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
    let probs = this.deathAndReproductionProb(imgData);
		// die?
		if (this.outOfBounds() ||
				this.collision(imgData) ||
				random.number() < probs.death) {
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
    if (USE_NICHE) {
      let differenceFromPreference = this.localDensity(imgData)-this.delta;
      let nicheFactor = Math.pow(
        Math.cos(this.bound(
          2*Math.PI*(differenceFromPreference),
          -Math.PI/2,
          Math.PI/2
        )),
        NICHE_WIDTH
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

	bound: function (num, min, max) {
		return Math.max(Math.min(num, max), min);
	},

  // using 4 pixels on the canvas that the nag is over, determines if the
  // nag is colliding with a line
	collision: function (data) {
		let nextX = this.p.x + VEL*Math.cos(this.theta);
		let nextY = this.p.y + VEL*Math.sin(this.theta);
		let p1 = data[4*canvas.width*Math.floor(nextY)+4*Math.floor(nextX)+3];
		let p2 = data[4*canvas.width*Math.floor(nextY)+4*Math.ceil(nextX)+3];
		let p3 = data[4*canvas.width*Math.ceil(nextY)+4*Math.floor(nextX)+3];
		let p4 = data[4*canvas.width*Math.ceil(nextY)+4*Math.ceil(nextX)+3];
		return (p1+p2+p3+p4)>190;
	},

  // returns the ratio of 'inked' area to total area around the nag. "area around
  // the nag" is a square with side length given by the global constant NICHE_AREA_SIZE
  localDensity: function (data) {
    xStart = Math.floor(this.p.x-NICHE_AREA_SIZE/2);
    xEnd = Math.ceil(this.p.x+NICHE_AREA_SIZE/2);
    yStart = Math.floor(this.p.y-NICHE_AREA_SIZE/2);
    yEnd = Math.ceil(this.p.y+NICHE_AREA_SIZE/2);
    var totalArea = 0;
    // since a single "black pixel" is sometimes averaged over multiple pixels, we'll
    // try adding up the total opacity within the area, and getting a count by
    // dividing by 255
    var inkedOpacityCount = 0;
    for (var x = xStart; x < xEnd; x++) {
      for (var y = yStart; y < yEnd; y++) {
        inkedOpacityCount += data[4*canvas.width*y+4*x+3];
        totalArea++;
      }
    }
    var density = (inkedOpacityCount / 255) / totalArea;
    return density;
  },

	outOfBounds: function () {
		return this.p.x < 0 || this.p.y < 0 || this.p.x > canvas.width || this.p.y > canvas.height;
	},

	bearOffspring: function () {
		return new Nag(this.ro+normalDistRand()*MUTATION_SEVERITY,
									 this.r+normalDistRand()*MUTATION_SEVERITY,
									 this.f+normalDistRand()*MUTATION_SEVERITY,
									 this.m+normalDistRand()*MUTATION_SEVERITY,
									 this.phi+normalDistRand()*MUTATION_SEVERITY,
                   this.delta+normalDistRand()*MUTATION_SEVERITY,
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
		this.dthetadt = this.ro + normalDistRand()*this.r;
		// FIXME Arbitrarily bounding dthetadt by -1 and 1 rads/frame
    // this.dthetadt = this.bound(this.dthetadt, -1, 1);

		// update the heading and position of the nag
		this.theta += this.dthetadt;
		this.p.x += VEL*Math.cos(this.theta);
		this.p.y += VEL*Math.sin(this.theta);
	}
}

main();
