import * as v2 from "./v2.js";
import { Drawer } from "./graph.js";

const radius = 10;

class KMeans {
  centroids: v2.v2[] = [];
  points: v2.v2[] = [];
  centroidAssignment: number[] = [];
  drawer: Drawer = new Drawer("kmeans-canvas", radius);
  constructor() {
    this.resetCentroids(3);
    document.getElementById("k")?.addEventListener("input", (event) => {
      let k = +(event.target as HTMLInputElement).value;
      if (Number.isFinite(k)) {
        this.resetCentroids(k);
      }
    });
    // document.getElementById("reset")?.addEventListener("click", this.reset);
    document.getElementById("reset")?.addEventListener("click", () => {
      this.resetCentroids(this.centroids.length);
    });
    document.getElementById("assign")?.addEventListener("click", () => {
      this.centroidAssignment = [];
      for (let p of this.points) {
        let bj = 0;
        let bd = null;
        for (let j = 0; j < this.centroids.length; j++) {
          let d = v2.distPoint(p, this.centroids[j]);
          if (bd === null || d < bd) {
            bd = d;
            bj = j;
          }
        }
        this.centroidAssignment.push(bj);
      }
      this.draw();
    });
    document.getElementById("nudge")?.addEventListener("click", () => {
      for (let i = 0; i < this.centroids.length; i++) {
        let c = 0;
        let p = { x: 0, y: 0 };
        for (let j = 0; j < this.centroidAssignment.length; j++) {
          if (this.centroidAssignment[j] == i) {
            c++;
            p = v2.addPoint(p, this.points[j]);
          }
        }
        if (c != 0) {
          this.centroids[i] = { x: p.x / c, y: p.y / c };
        }
      }
      this.draw();
    });
    this.drawer.canvas.addEventListener("click", (event) => {
      const scrollX = window.scrollX || window.pageXOffset;
      const scrollY = window.scrollY || window.pageYOffset;
      const x = event.clientX - this.drawer.canvas.offsetLeft + scrollX;
      const y = event.clientY - this.drawer.canvas.offsetTop + scrollY;
      this.points.push({ x, y });
      this.draw();
    });
  }
  resetCentroids(k: number): void {
    this.centroids = [];
    this.centroidAssignment = [];
    for (let i = 0; i < k; i++) {
      let x = Math.random() * this.drawer.canvas.width;
      let y = Math.random() * this.drawer.canvas.height;
      this.centroids.push({ x, y });
    }
    this.draw();
  }
  draw(): void {
    this.drawer.clear();
    for (let p of this.centroids) {
      this.drawer.addVertex(p);
    }
    for (let p of this.points) {
      this.drawer.addVertex(p);
    }
    let lp = this.centroidAssignment.length;
    let k = this.centroids.length;
    for (let i = 0; i < lp; i++) {
      this.drawer.addEdge(this.centroidAssignment[i], k + i);
    }
    this.drawer.draw();
    for (let p of this.centroids) {
      this.drawer.pencil.circle(p, radius, "red");
    }
  }
}

// setting variable makes inspection easier from browser
// let controller = new Controller();
let kmeans = new KMeans();
