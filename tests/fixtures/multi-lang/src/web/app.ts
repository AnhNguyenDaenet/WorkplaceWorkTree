import { Base } from './base';

export interface Greeter {
  greet(): string;
}

export class App extends Base implements Greeter {
  run(): void {
    console.log(this.greet());
  }
}
