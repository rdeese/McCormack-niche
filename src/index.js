const _ = require('lodash')
import { makeNoise2D } from "open-simplex-noise"
const { makeRectangle } = require('fractal-noise')
const QuadTree = require('./lib/QuadTree')
let Canvas
let path
let fs

if (!process.env.WEBPACK) {
  Canvas = require('canvas')
  path = require('path')
  fs = require('fs')
}

let VEL = 0.5
let GESTATION = 2
let NAG_SIZE = 0.5
let USE_NICHE = true
let NICHE_WIDTHS = [50, 100, 200]
let NICHE_SPECIFICITY = 20
let NICHE_AREA_SIZES = [40, 80, 160]
let NICHE_AREA_SIZE = 10
let NUM_NAGS = 10
let MUTATION_SEVERITIES = [0.1, 0.2]
let MUTATION_SEVERITY = 0.3
let REPETITIONS = 2
let LOG_INTERVAL = 100
let DEAD_NAGS = []
let WORLD_TIME = 0

let canvas

// returns a random float drawn from an approximate standard normal distribution
// as per the central limit theorem (std. dev. 1, mean 0)
const normalDistRand = function () {
  let sample = 0
  for (let i = 0; i < 6; i++) {
    sample += Math.random()
  }
  return (sample - 3) / 3
}

const getQueryParam = (variable) => {
  const query = window.location.search.substring(1)
  const vars = query.split('&')
  for (let i = 0; i < vars.length; i++) {
    const pair = vars[i].split('=')
    if (decodeURIComponent(pair[0]) == variable) {
      return decodeURIComponent(pair[1])
    }
  }
}

let node_main = function () {
  if (process.argv[2] == "--wallpaper") {
    canvas = new Canvas(1920, 1080)
    let context = canvas.getContext("2d")
    let w = new World(context)
    w.run()
    let filePath = path.resolve(process.cwd(), `wallpaper.png`)
    fs.writeFileSync(filePath, canvas.toBuffer())
  } else if (process.argv[2] == "--render") {
    const numRenders = parseInt(process.argv[3]) || 1
    for (let i = 0; i < numRenders; i++) {
      canvas = new Canvas(2000, 1000)
      let context = canvas.getContext("2d")
      let w = new World(context)
      w.run()
      const timestamp = (new Date()).toISOString().replace(/(-|T|:|Z|\.\d+)/g, '')
      let filePath = path.resolve(process.cwd(), `images/niche-${timestamp}.png`)
      fs.writeFileSync(filePath, canvas.toBuffer())
    }
  } else {
    _.forEach(NICHE_WIDTHS, (width) => {
      _.forEach(NICHE_AREA_SIZES, (size) => {
        _.forEach(MUTATION_SEVERITIES, (severity) => {
          for (let i = 0; i < REPETITIONS; i++) {
            fileId = ["niche-width", width, "niche-area", size, "mutation-size", severity, "run", i].join('_')
            NICHE_SPECIFICITY = width
            NICHE_AREA_SIZE = size
            MUTATION_SEVERITY = severity
            canvas = new Canvas(1920, 1080)
            let context = canvas.getContext("2d")
            let w = new World(context)
            w.run()
            let filePath = path.resolve(process.cwd(), 'images', `output_${fileId}.png`)
            fs.writeFileSync(filePath, canvas.toBuffer())
          }
        })
      })
    })
  }
}

let browser_main = function () {
  NICHE_SPECIFICITY = getQueryParam("NICHE_SPECIFICITY") || NICHE_SPECIFICITY
  NICHE_AREA_SIZE = getQueryParam("NICHE_AREA_SIZE") || NICHE_AREA_SIZE
  NUM_NAGS = getQueryParam("NUM_NAGS") || NUM_NAGS
  MUTATION_SEVERITY = getQueryParam("MUTATION_SEVERITY") || MUTATION_SEVERITY
  const useNiche = getQueryParam("USE_NICHE")
  if (useNiche !== undefined) {
    USE_NICHE = useNiche
  }
  console.log("============ PARAMS ============")
  console.log(
`NICHE_SPECIFICITY: ${NICHE_SPECIFICITY}
NICHE_AREA_SIZE: ${NICHE_AREA_SIZE}
NUM_NAGS: ${NUM_NAGS}
MUTATION_SEVERITY: ${MUTATION_SEVERITY}
USE_NICHE: ${USE_NICHE}`
  )
  console.log("================================")
  
	canvas = document.querySelector("#world")
  canvas.width = document.documentElement.clientWidth-20
  canvas.height = document.documentElement.clientHeight-20
  let context = canvas.getContext("2d")
  let w = new World(context)

  let animate = () => {
    WORLD_TIME = WORLD_TIME + 1
    w.step()
    if (w.nagList.length == 0) {
      setTimeout(1000)
      context.clearRect(0, 0, canvas.width, canvas.height)
      console.log("========== RESTART ===========")
      const topNags = _.sortBy(DEAD_NAGS, (nag) => -nag.age).slice(0, 10)
      console.log(topNags)
      WORLD_TIME = 0
      w = new World(context, topNags)
    }
    requestAnimationFrame(animate)
  }

  animate()
}

let World = function (context, nags) {
	this.init(context, nags)
}

World.prototype = {
	init: function (context, nags) {
		this.context = context
		this.width = context.canvas.width
		this.height = context.canvas.height
		this.timestep = 0

    let openSimplex = makeNoise2D(Date.now())
    this.noiseMaps = []
    for (let i = 0; i <= 1; i += 0.2) {
      this.noiseMaps.push(makeRectangle(this.width, this.height, openSimplex, { octaves: 2, persistence: i/2, frequency: 0.005 }))
    }

    this.initializeNags(nags)
	},

	fracSum: function (x, y, irrationality) {
    x = Math.floor(x)
    y = Math.floor(y)
    let noiseMap = this.noiseMaps[Math.round(irrationality*5)]
    return noiseMap[x][y]
	},

	initializeNags: function (nags) {
    nags = nags || []
		this.nagList = []
		for (let i = 0; i < NUM_NAGS; ++i) {
      const newNag = nags[i] || new Nag(
        0.2 * Math.random() - 0.1, // curvature
        0.2 * Math.random(), // irrationality
        Math.random() * 0.1, // fecundity,
        0.01*Math.random(), // mortality
        2*Math.random()*Math.PI, // offset
        Math.random() * 0.2, // niche
        { x: Math.random() * this.width, y: Math.random() * this.height }, // position
        Math.random()*Math.PI*2 // rotation
        // 0, // curvature
        // 0.5*Math.random(), // irrationality
        // 0.1+0.3*Math.random(), // fecundity,
        // 0.01*Math.random(), // mortality
        // 2*Math.random()*Math.PI, // offset
        // 0.2*Math.random(), // niche
        // { x: Math.random() * this.width, y: Math.random() * this.height }, // position
        // Math.random()*Math.PI*2 // rotation
      )
      newNag.x = Math.random() * this.width
      newNag.y = Math.random() * this.height
      newNag.age = 0
      this.nagList.push(newNag)
		}
	},

  updateQuadTree: function () {
    this.quadTree.clear()
    this.quadTree.insert(this.nagList)
  },

	step: function () {
    let newNagList = []
    let imgData = this.context.getImageData(0,0, this.width, this.height).data

    // this.updateQuadTree()

    for (let i = 0; i < this.nagList.length; i++) {
      // get the current nag
      let nag = this.nagList[i]
      let probs = nag.deathAndReproductionProb(imgData)
      if (nag.survive(probs.death, imgData)) {
        nag.iteratePosition(this.fracSum.bind(this))
        newNagList.push(nag)
        newNagList.push(...nag.breed(probs.reproduction))
      } else {
        DEAD_NAGS.push(nag)
      }

      // if it's old enough, we draw it
      if (nag.age > GESTATION) {
        const red = Math.floor(Math.pow(nag.age/300, 2)*255)
        const green = Math.floor(Math.pow(nag.fecundity, 1)*255*2)
        const blue = Math.floor(Math.pow(nag.niche, 1.5)*255*10)
        this.context.fillStyle = `rgb(${red}, ${green}, ${blue})`
        this.context.fillRect(nag.x, nag.y, NAG_SIZE, NAG_SIZE)
      }
    }

    this.nagList = newNagList

    if (this.timestep % LOG_INTERVAL == 0) {
      let population = this.nagList.length
      let avgF = this.nagList.reduce((sum, nag) => { return sum += nag.fecundity }, 0)/this.nagList.length
      let avgNiche = this.nagList.reduce((sum, nag) => { return sum += nag.niche }, 0)/this.nagList.length
      let avgM = this.nagList.reduce((sum, nag) => { return sum += nag.mortality }, 0)/this.nagList.length
      let avgR = this.nagList.reduce((sum, nag) => { return sum += nag.irrationality }, 0)/this.nagList.length
      let avgRo = this.nagList.reduce((sum, nag) => { return sum += nag.curvature }, 0)/this.nagList.length
      if (process.env.WEBPACK) {
        console.log(`Population: ${population} Fertility: ${avgF.toFixed(2)} Mortality: ${avgM.toFixed(2)} Curvature ${avgRo.toFixed(2)} Irrationality: ${avgR.toFixed(2)} Niche preference: ${avgNiche.toFixed(2)}`)
      }
    }

    this.timestep += 1
	},

	run: function () {
    while (this.nagList.length > 0) {
      this.step()
    }
	}
}

let Nag = function (curvature, irrationality, fecundity, mortality, offset, niche, location, heading) { // curvature, irrationality, fecundity, mortality, offset, niche
	this.init(curvature, irrationality, fecundity, mortality, offset, niche, location, heading)
}

Nag.prototype = {
	init: function (curvature, irrationality, fecundity, mortality, offset, niche, location, heading) {
		// the genome
		this.curvature = this.bound(curvature, -0.2, 0.2)
		this.irrationality =  this.bound(irrationality, 0, 0.2)
		this.fecundity =  this.bound(fecundity, 0, 0.2)
		this.mortality =  0.1 // this.bound(mortality, 0.001, 1)
		this.offset = offset
    this.niche = this.bound(niche, 0, 1)
		// end genome

		this.x = location.x
    this.y = location.y

		this.heading = heading

		this.age = 0
	},

  isCollidingWithNeighbor: function (nearbyNags) {
    for (let neighbor of nearbyNags) {
      if (
        Math.abs(neighbor.x - this.x) < 1 &&
        Math.abs(neighbor.y - this.y) < 1 && 
        this.age < neighbor.age
      ) {
        return true
      }
    }
  },

  survive: function (deathProb, imgData) {
    if (this.outOfBounds()) {
      this.wrap()
      // console.log(`died age ${this.age}, out of bounds`)
    } else if (Math.random() < deathProb) {
      // console.log(`died age ${this.age}, out of their niche`)
      return false
    } else if (this.collision(imgData)) {
      // console.log(`died age ${this.age}, in a collision`)
      return false
		}
		this.age++
    return true;
  },

	breed: function (breedingProb) {
		if (this.age > GESTATION && Math.random() < breedingProb) {
			return [this.bearOffspring()]
		}
    return []
	},

  deathAndReproductionProb: function (imgData) {
    if (USE_NICHE) {
      let differenceFromPreference = Math.abs(this.localDensity(imgData) - this.niche)
      let nicheFactor = Math.pow(
        Math.cos(this.bound(
          Math.PI*(differenceFromPreference),
          -Math.PI/2,
          Math.PI/2
        )),
        NICHE_SPECIFICITY * (WORLD_TIME / 500)
      )
      return {
        death: this.mortality * (1-nicheFactor),
        reproduction: this.fecundity
      }
    } else {
      return {
        death: this.mortality,
        reproduction: this.fecundity
      }
    }
  },

	bound: function (num, min, max) {
		return Math.max(Math.min(num, max), min)
	},

  // using 4 pixels on the canvas that the nag is over, determines if the
  // nag is colliding with a line
	collision: function (data) {
		let nextX = this.x + VEL*Math.cos(this.heading)
		let nextY = this.y + VEL*Math.sin(this.heading)
    let alphaSum = 0

    for (let x = Math.floor(nextX); x <= Math.ceil(nextX); x++) {
      for (let y = Math.floor(nextY); y <= Math.ceil(nextY); y++) {
        alphaSum += data[4*canvas.width*y+4*x+3]
      }
    }

		return alphaSum > 300
	},

  // returns the ratio of 'inked' area to total area around the nag. "area around
  // the nag" is a square with side length given by the global constant NICHE_AREA_SIZE
  localDensity: function (data) {
    const xStart = Math.floor(this.x-NICHE_AREA_SIZE/2)
    const xEnd = Math.ceil(this.x+NICHE_AREA_SIZE/2)
    const yStart = Math.floor(this.y-NICHE_AREA_SIZE/2)
    const yEnd = Math.ceil(this.y+NICHE_AREA_SIZE/2)
    let totalArea = 0
    let inkedPixelCount = 0
    for (let x = xStart; x < xEnd; x++) {
      for (let y = yStart; y < yEnd; y++) {
        if (data[4*canvas.width*y+4*x+3] > 0) {
          inkedPixelCount += 1
        }
        totalArea++
      }
    }
    const density = inkedPixelCount / totalArea
    return density
  },

  wrap: function () {
    this.x = (this.x + canvas.width) % canvas.width
    this.y = (this.y + canvas.height) % canvas.height
  },

	outOfBounds: function () {
		return (
      this.x === NaN ||
      this.y === NaN ||
      this.x < 0 ||
      this.y < 0 ||
      this.x >= canvas.width ||
      this.y >= canvas.height
    )
	},

	bearOffspring: function () {
    return new Nag(
      this.curvature+normalDistRand()*MUTATION_SEVERITY,
      this.irrationality+normalDistRand()*MUTATION_SEVERITY,
      this.fecundity+normalDistRand()*MUTATION_SEVERITY,
      this.mortality+normalDistRand()*MUTATION_SEVERITY,
      this.offset+normalDistRand()*MUTATION_SEVERITY,
      this.niche+normalDistRand()*MUTATION_SEVERITY/2,
      { x: this.x, y: this.y },
      this.heading+this.offset
    )
	},

	// update the Nag's position based on its heading (theta) and current position.
	// coordinate space used has the 0 heading pointing ->, and positive increase
	// in heading goes counterclockwise, like graph quadrants.
	iteratePosition: function (fracSum) {
    let randomChange = fracSum(this.x, this.y, this.irrationality) * Math.pow(this.irrationality, 2)
		let dthetadt = Math.pow(this.curvature, 3) + randomChange

		// update the heading and position of the nag
		this.heading += dthetadt
    const deltaX = VEL*Math.cos(this.heading)
    const deltaY = VEL*Math.sin(this.heading)
    if (deltaX === NaN || deltaY === NaN) {
      throw new Error('got NaN issues')
    }
		this.x += deltaX
		this.y += deltaY
	}
}

if (process.env.WEBPACK) {
  window.onload = browser_main
} else {
  node_main()
}
