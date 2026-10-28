// Motion tokens: four durations, five eases. Everything moves on these.
import { gsap } from 'gsap';
import { CustomEase } from 'gsap/CustomEase';
import { Observer } from 'gsap/Observer';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import { SplitText } from 'gsap/SplitText';
import { Flip } from 'gsap/Flip';

gsap.registerPlugin(CustomEase, Observer, ScrambleTextPlugin, SplitText, Flip);

export const D = { snap: 0.12, step: 0.24, land: 0.6, travel: 1.1 } as const;

export const E = {
  detent: CustomEase.create('vf.detent', 'M0,0 C0.16,0.62 0.28,1.05 0.44,1.035 0.6,1.02 0.74,1 1,1'),
  lens: CustomEase.create('vf.lens', '0.62,0,0.16,1'),
  out: CustomEase.create('vf.out', '0.16,1,0.3,1'),
  in: CustomEase.create('vf.in', '0.5,0,0.9,0.4'),
  needle: CustomEase.create('vf.needle', 'M0,0 C0.14,0.7 0.22,1.16 0.34,1.12 0.46,1.08 0.52,0.95 0.64,0.975 0.76,1 0.84,1.005 1,1'),
  rack: CustomEase.create('vf.rack', 'M0,0 C0.2,0.7 0.34,1.07 0.5,1.06 0.66,1.05 0.72,0.99 1,1'),
};

export const CHARS = '0123456789';
export const CHARS_UP = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export { gsap, Observer, SplitText, CustomEase, Flip };
