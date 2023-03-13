mod utils;

use crate::utils::Timer;
use std::fmt;
use wasm_bindgen::prelude::*;

// When the `wee_alloc` feature is enabled, use `wee_alloc` as the global
// allocator.
#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

#[wasm_bindgen]
#[repr(u8)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Cell {
    Dead = 0,
    Alive = 1,
}
impl Cell {
    fn toggle(&mut self) {
        *self = match *self {
            Cell::Dead => Cell::Alive,
            Cell::Alive => Cell::Dead,
        };
    }
}

#[wasm_bindgen]
pub struct Universe {
    width: usize,
    height: usize,
    cells: Vec<Cell>,
    swap: Vec<Cell>,
}

#[wasm_bindgen]
impl Universe {
    pub fn new() -> Universe {
        utils::set_panic_hook();

        let width = 128;
        let height = 128;

        let cells: Vec<Cell> = (0..width * height)
            .map(|i| {
                if i % 2 == 0 || i % 7 == 0 {
                    Cell::Alive
                } else {
                    Cell::Dead
                }
            })
            .collect();

        Universe {
            width,
            height,
            swap: cells.clone(),
            cells,
        }
    }

    pub fn render(&self) -> String {
        self.to_string()
    }

    fn get_index(&self, row: usize, column: usize) -> usize {
        row * self.width + column
    }

    pub fn width(&self) -> usize {
        self.width
    }

    pub fn height(&self) -> usize {
        self.height
    }

    pub fn set_width(&mut self, width: usize) {
        self.width = width;
        self.reset_cells();
    }

    pub fn set_height(&mut self, height: usize) {
        self.height = height;
        self.reset_cells();
    }

    pub fn reset_cells(&mut self) {
        self.cells.clear();
        self.cells
            .extend((0..self.width * self.height).map(|_i| Cell::Dead));
        self.swap.clone_from(&self.cells);
    }

    pub fn cells(&self) -> *const Cell {
        self.cells.as_ptr()
    }

    pub fn toggle_cell(&mut self, row: usize, column: usize) {
        let idx = self.get_index(row, column);
        self.cells[idx].toggle();
    }

    fn live_neighbor_count(&self, row: usize, col: usize) -> u8 {
        let north = if row == 0 { self.height - 1 } else { row - 1 };
        let south = if row == self.height - 1 { 0 } else { row + 1 };
        let west = if col == 0 { self.width - 1 } else { col - 1 };
        let east = if col == self.width - 1 { 0 } else { col + 1 };

        IntoIterator::into_iter([
            (north, west),
            (north, col),
            (north, east),
            (row, west),
            // center
            (row, east),
            (south, west),
            (south, col),
            (south, east),
        ])
        .map(|(nbr_row, nbr_col)| {
            let i = self.get_index(nbr_row, nbr_col);
            self.cells[i] as u8
        })
        .sum()
    }

    pub fn tick(&mut self) {
        #[cfg(target_arch = "wasm32")]
        let _timer = Timer::new("Universe::tick");

        for row in 0..self.height {
            for col in 0..self.width {
                let idx = self.get_index(row, col);
                let cell = self.cells[idx];
                let live_neighbors = self.live_neighbor_count(row, col);

                let next_cell = match (cell, live_neighbors) {
                    // Rule 1: Any live cell with fewer than two live neighbours
                    // dies, as if caused by underpopulation.
                    // Rule 3: Any live cell with more than three live
                    // neighbours dies, as if by overpopulation.
                    // Rule 1+3: Any live cell that doesn't have two or three neighbors dies.
                    (Cell::Alive, x) if x != 2 && x != 3 => Cell::Dead,
                    // Rule 4: Any dead cell with exactly three live neighbours
                    // becomes a live cell, as if by reproduction.
                    (Cell::Dead, 3) => Cell::Alive,
                    // All other cells remain in the same state. (effectively includes rule 2)
                    // Rule 2: Any live cell with two or three live neighbours
                    // lives on to the next generation.
                    (otherwise, _) => otherwise,
                };

                self.swap[idx] = next_cell;
            }
        }

        std::mem::swap(&mut self.cells, &mut self.swap);
    }
}

impl Universe {
    pub fn get_cells(&self) -> &[Cell] {
        &self.cells
    }

    pub fn set_cells(&mut self, cells: &[(usize, usize)]) {
        for (row, col) in cells.iter().cloned() {
            let idx = self.get_index(row, col);
            self.cells[idx] = Cell::Alive;
        }
    }
}

impl Default for Universe {
    fn default() -> Self {
        Self::new()
    }
}

impl fmt::Display for Universe {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        for line in self.cells.as_slice().chunks(self.width) {
            for &cell in line {
                let symbol = if cell == Cell::Dead { '◻' } else { '◼' };
                write!(f, "{}", symbol)?;
            }
            writeln!(f)?;
        }

        Ok(())
    }
}
