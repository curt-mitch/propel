/*!
   Copyright 2018 Propel http://propel.site/.  All rights reserved.
   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
 */

// Propel Notebook Cell.

export interface CellProps {
  code?: string;
  onRun?: (code: null | string) => void;
  // If onDelete or onInsertCell is null, it hides the button.
  onDelete?: () => void;
  onInsertCell?: () => void;
}
export interface CellState { }

export class Cell extends Component<CellProps, CellState> {
  parentDiv: Element;
  input: Element;
  output: Element;
  private outputHandler: OutputHandlerDOM;
  cm: CodeMirrorComponent;
  readonly id: number;
  outputHTML?: string;

  constructor(props) {
    super(props);
    this.id = nextCellId++;
    if (prerenderedOutputs.has(this.id)) {
      this.outputHTML = prerenderedOutputs.get(this.id);
    }
    cellTable.set(this.id, this);
  }

  componentWillMount() {
    if (!this.outputHTML) {
      cellExecuteQueue.push(this);
    }
  }

  get code(): string {
    return normalizeCode(this.cm ? this.cm.code : this.props.code);
  }

  getOutputHandler() {
    if (!this.outputHandler) {
      this.outputHandler = new OutputHandlerDOM(this.output);
    }
    return this.outputHandler;
  }

  downloadProgress(data) {
    const o = new OutputHandlerDOM(this.output);
    o.downloadProgress(data);
  }

  clearOutput() {
    this.output.innerHTML = "";
  }

  focusNext() {
    const cellsEl = this.parentDiv.parentElement;
    // Don't focus next if we're in the docs.
    if (cellsEl.className !== "cells") return;

    const nbCells = cellsEl.getElementsByClassName("notebook-cell");
    assert(nbCells.length > 0);

    // NodeListOf<Element> doesn't have indexOf. We loop instead.
    for (let i = 0; i < nbCells.length - 1; i++) {
      if (nbCells[i] === this.parentDiv) {
        const nextCellElement = nbCells[i + 1];
        const next = lookupCell(nextCellElement.id);
        assert(next != null);
        next.focus();
        return;
      }
    }
  }

  focus() {
    this.cm.focus();
    this.parentDiv.classList.add("notebook-cell-focus");
    this.parentDiv.scrollIntoView();
  }

  // This method executes the code in the cell, and updates the output div with
  // the result. The onRun callback is called if provided.
  async run() {
    this.clearOutput();
    const classList = (this.input.parentNode as HTMLElement).classList;
    classList.add("notebook-cell-running");

    await sandbox().call("runCell", this.code, this.id);

    classList.add("notebook-cell-updating");
    await delay(100);
    classList.remove("notebook-cell-updating");
    classList.remove("notebook-cell-running");

    if (this.props.onRun) this.props.onRun(this.code);
  }

  clickedDelete() {
    console.log("Delete was clicked.");
    if (this.props.onDelete) this.props.onDelete();
  }

  clickedInsertCell() {
    console.log("NewCell was clicked.");
    if (this.props.onInsertCell) this.props.onInsertCell();
  }

  render() {
    const runButton = (
      <button class="run-button" onClick={ this.run.bind(this) } />
    );

    let deleteButton = null;
    if (this.props.onDelete) {
      deleteButton = (
        <button
          class="delete-button"
          onClick={ this.clickedDelete.bind(this) } />
      );
    }

    let insertButton = null;
    if (this.props.onInsertCell) {
      insertButton = (
        <button
          class="insert-button"
          onClick={ this.clickedInsertCell.bind(this) } />
      );
    }

    // If supplied outputHTML, use that in the output div.
    const outputDivAttr = {
      "class": "output",
      "id": "output" + this.id,
      "ref": (ref => { this.output = ref; }),
    };
    if (this.outputHTML) {
      outputDivAttr["dangerouslySetInnerHTML"] = {
        __html: this.outputHTML,
      };
    }
    const outputDiv = <div { ...outputDivAttr } />;

    const runCellAndFocusNext = () => {
      this.run();
      this.cm.blur();
      this.focusNext();
    };

    return (
      <div
        class="notebook-cell"
        id={ `cell${this.id}` }
        ref={ ref => { this.parentDiv = ref; } } >
        <div
          class="input"
          ref={ ref => { this.input = ref; } } >
          <CodeMirrorComponent
            code={ this.code }
            ref={ ref => { this.cm = ref; } }
            onFocus={ () => {
              this.parentDiv.classList.add("notebook-cell-focus");
            } }
            onBlur={ () => {
              this.parentDiv.classList.remove("notebook-cell-focus");
            } }
            onAltEnter={ runCellAndFocusNext }
            onShiftEnter={ runCellAndFocusNext }
            onCtrlEnter={ () => { this.run(); } }
          />
          { deleteButton }
          { runButton }
        </div>
        <div class="progress-bar" />
        <div class="output-container">
          { outputDiv }
          { insertButton }
        </div>
      </div>
    );
  }
}
