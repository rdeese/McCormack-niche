const _ = require('lodash');
const OpenSimplexNoise = require('open-simplex-noise').default;
const { makeRectangle } = require('fractal-noise');
const QuadTree = require('./lib/QuadTree');
let Canvas;
let path;
let fs;

if (!process.env.WEBPACK) {
  Canvas = require('canvas');
  path = require('path');
  fs = require('fs');
}

let VEL = 1;
let GESTATION = 2;
let NAG_SIZE = 1;
let USE_NICHE = true;
let NICHE_WIDTHS = [50, 100, 200];
let NICHE_WIDTH = 100;
let NICHE_AREA_SIZES = [40, 80, 160];
let NICHE_AREA_SIZE = 120;
let NUM_NAGS = 10;
let MUTATION_SEVERITIES = [0.1, 0.2];
let MUTATION_SEVERITY = 0.3;
let REPETITIONS = 2;
let LOG_INTERVAL = 100;

let canvas;

// returns a random float drawn from an approximate standard normal distribution
// as per the central limit theorem (std. dev. 1, mean 0)
const normalDistRand = function () {
  let sample = 0;
  for (let i = 0; i < 6; i++) {
    sample += Math.random();
  }
  return (sample - 3) / 3
}

const getQueryParam = (variable) => {
  var query = window.location.search.substring(1);
  var vars = query.split('&');
  for (var i = 0; i < vars.length; i++) {
    var pair = vars[i].split('=');
    if (decodeURIComponent(pair[0]) == variable) {
      return decodeURIComponent(pair[1]);
    }
  }
}

let node_main = function () {
  _.forEach(NICHE_WIDTHS, (width) => {
    _.forEach(NICHE_AREA_SIZES, (size) => {
      _.forEach(MUTATION_SEVERITIES, (severity) => {
        for (let i = 0; i < REPETITIONS; i++) {
          fileId = ["niche-width", width, "niche-area", size, "mutation-size", severity, "run", i].join('_');
          console.log(`\n\n================\nSTARTING ${fileId}\n================`);
          NICHE_WIDTH = width;
          NICHE_AREA_SIZE = size;
          MUTATION_SEVERITY = severity;
          canvas = new Canvas(1000, 1000);
          let context = canvas.getContext("2d");
          let w = new World(context);
          w.run();
          let filePath = path.resolve(process.cwd(), 'images', `output_${fileId}.png`);
          fs.writeFileSync(filePath, canvas.toBuffer());
        }
      });
    });
  });
};

let browser_main = function () {
  NICHE_WIDTH = getQueryParam("NICHE_WIDTH") || NICHE_WIDTH;
  NICHE_AREA_SIZE = getQueryParam("NICHE_AREA_SIZE") || NICHE_AREA_SIZE;
  NUM_NAGS = getQueryParam("NUM_NAGS") || NUM_NAGS;
  MUTATION_SEVERITY  = getQueryParam("MUTATION_SEVERITY ") || MUTATION_SEVERITY;
  USE_NICHE  = getQueryParam("USE_NICHE ") || USE_NICHE;
  
	canvas = document.querySelector("#world");
  canvas.width = document.documentElement.clientWidth-20;
  canvas.height = document.documentElement.clientHeight-20;
  let context = canvas.getContext("2d");
  let w = new World(context);

  let animate = () => {
    w.step();
    if (w.nagList.length == 0) {
      setTimeout(1000);
      context.clearRect(0, 0, canvas.width, canvas.height);
      console.log("========== RESTART ===========");
      w = new World(context);
    }
    requestAnimationFrame(animate);
  };

  animate();
}

let World = function (context) {
	this.init(context);
};

World.prototype = {
	init: function (context) {
		this.context = context;
		this.width = context.canvas.width;
		this.height = context.canvas.height;
		this.timestep = 0;

    let openSimplex = new OpenSimplexNoise(Date.now());
    let noiseFunc = (x, y) => {
      return openSimplex.noise2D(x, y);
    }
    this.noiseMaps = []

    for (let i = 0; i <= 1; i += 0.2) {
      this.noiseMaps.push(makeRectangle(this.width, this.height, noiseFunc.bind(this), { octaves: 2, persistence: i/2, frequency: 0.005 }));
    }

		this.populateNagList();
    this.quadTree = new QuadTree({ x: 0, y: 0, width: this.width, height: this.height }, true, 7);
	},

	fracSum: function (x, y, r) {
    x = Math.floor(x);
    y = Math.floor(y);
    let noiseMap = this.noiseMaps[Math.round(r*5)];
    return noiseMap[x][y];
	},

	populateNagList: function () {
		this.nagList = [];
		for (let i = 0; i < NUM_NAGS; ++i) {
      this.nagList.push(new Nag(
        0, // curvature
        0.5*Math.random(), // irrationality
        0.1+0.3*Math.random(), // fecundity,
        0.01*Math.random(), // mortality
        2*Math.random()*Math.PI, // offset
        0.2*Math.random(), // niche
        { x: Math.random()*this.width, y: Math.random()*this.height }, // position
        Math.random()*Math.PI*2)); // rotation
		}
	},

  updateQuadTree: function () {
    this.quadTree.clear();
    this.quadTree.insert(this.nagList);
  },

	step: function () {
    let newNagList = [];
    let imgData = this.context.getImageData(0,0, this.width, this.height).data;

    this.updateQuadTree();

    for (let i = 0; i < this.nagList.length; i++) {
      // get the current nag
      let nag = this.nagList[i];
      nag.iteratePosition(this.fracSum.bind(this));

      let nags = nag.surviveAndBreed(this.quadTree.retrieve(nag), imgData);

      // if it's old enough, we draw it
      if (nag.age > GESTATION) {
        this.context.fillStyle = `rgb(${Math.floor(Math.pow(nag.age/300, 2)*255)}, ${Math.floor(Math.pow(nag.f, 1)*255*2)}, ${Math.floor(Math.pow(nag.delta, 1.5)*255*10)})`;
        this.context.fillRect(nag.x, nag.y, NAG_SIZE, NAG_SIZE);
      }

      newNagList.push(...nags)
    }

    this.nagList = newNagList;

    if (this.timestep % LOG_INTERVAL == 0) {
      let population = this.nagList.length;
      let avgF = this.nagList.reduce((sum, nag) => { return sum += nag.f }, 0)/this.nagList.length;
      let avgNiche = this.nagList.reduce((sum, nag) => { return sum += nag.delta }, 0)/this.nagList.length;
      let avgM = this.nagList.reduce((sum, nag) => { return sum += nag.m }, 0)/this.nagList.length;
      let avgR = this.nagList.reduce((sum, nag) => { return sum += nag.r }, 0)/this.nagList.length;
      let avgRo = this.nagList.reduce((sum, nag) => { return sum += nag.ro }, 0)/this.nagList.length;
      console.log(`Population: ${population} Fertility: ${avgF.toFixed(2)} Mortality: ${avgM.toFixed(2)} Curvature ${avgRo.toFixed(2)} Irrationality: ${avgR.toFixed(2)} Niche preference: ${avgNiche.toFixed(2)}`)
    }

    this.timestep += 1;
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
		this.m =  this.bound(m, 0.001, 1);
		this.phi = phi;
    this.delta = this.bound(delta, 0, 1);
		// end genome

		this.x = pos.x;
    this.y = pos.y;

		this.theta = theta;

		// a baby!
		this.age = 0;
	},

  isCollidingWithNeighbor: function (nearbyNags) {
    for (let neighbor of nearbyNags) {
      if (
        Math.abs(neighbor.x - this.x) < 1 &&
        Math.abs(neighbor.y - this.y) < 1 && 
        this.age < neighbor.age
      ) {
        return true;
      }
    }
  },

	surviveAndBreed: function (nearbyNags, imgData) {
    let probs = this.deathAndReproductionProb(imgData);
		// die?
    if (
      this.outOfBounds() ||
      (this.age > GESTATION && this.isCollidingWithNeighbor(nearbyNags)) ||
      Math.random() < probs.death ||
      this.collision(imgData)
    ) {
			return [];
		} else {
			this.returnedNags = [this];
		}
		// reproduce?
		if (this.age > GESTATION && Math.random() < probs.reproduction) {
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

	bound: function (num, min, max) {
		return Math.max(Math.min(num, max), min);
	},

  // using 4 pixels on the canvas that the nag is over, determines if the
  // nag is colliding with a line
	collision: function (data) {
		let nextX = this.x + VEL*Math.cos(this.theta);
		let nextY = this.y + VEL*Math.sin(this.theta);
    let alphaSum = 0;

    for (let x = Math.floor(nextX); x <= Math.ceil(nextX); x++) {
      for (let y = Math.floor(nextY); y <= Math.ceil(nextY); y++) {
        alphaSum += data[4*canvas.width*y+4*x+3];
      }
    }

		return alphaSum>190;
	},

  // returns the ratio of 'inked' area to total area around the nag. "area around
  // the nag" is a square with side length given by the global constant NICHE_AREA_SIZE
  localDensity: function (data) {
    xStart = Math.floor(this.x-NICHE_AREA_SIZE/2);
    xEnd = Math.ceil(this.x+NICHE_AREA_SIZE/2);
    yStart = Math.floor(this.y-NICHE_AREA_SIZE/2);
    yEnd = Math.ceil(this.y+NICHE_AREA_SIZE/2);
    var totalArea = 0;
    var inkedPixelCount = 0;
    for (var x = xStart; x < xEnd; x++) {
      for (var y = yStart; y < yEnd; y++) {
        if (data[4*canvas.width*y+4*x+3] > 0) {
          inkedPixelCount += 1;
        }
        totalArea++;
      }
    }
    var density = inkedPixelCount / totalArea;
    return density;
  },

	outOfBounds: function () {
		return this.x < 0 || this.y < 0 || this.x > canvas.width || this.y > canvas.height;
	},

	bearOffspring: function () {
    return new Nag(
      this.ro, //+normalDistRand()*MUTATION_SEVERITY,
      this.r+normalDistRand()*MUTATION_SEVERITY,
      this.f+normalDistRand()*MUTATION_SEVERITY,
      this.m+normalDistRand()*MUTATION_SEVERITY*MUTATION_SEVERITY,
      this.phi+normalDistRand()*MUTATION_SEVERITY,
      this.delta+normalDistRand()*MUTATION_SEVERITY,
      { x: this.x, y: this.y },
      this.theta+this.phi
    );
	},

	// update the Nag's position based on its heading (theta) and current position.
	// coordinate space used has the 0 heading pointing ->, and positive increase
	// in heading goes counterclockwise, like graph quadrants.
	iteratePosition: function (fracSum) {
    let randomChange = fracSum(this.x, this.y, this.r) * Math.pow(this.r, 2);
		let dthetadt = this.ro + randomChange;

		// update the heading and position of the nag
		this.theta += dthetadt;
		this.x += VEL*Math.cos(this.theta);
		this.y += VEL*Math.sin(this.theta);
	}
}

if (process.env.WEBPACK) {
  window.onload = browser_main;
} else {
  node_main();
}
