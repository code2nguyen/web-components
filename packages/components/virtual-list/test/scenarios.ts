import '../src/virtual-list'
import type { VirtualList } from '../src/virtual-list'
import type { VirtualListItemsRequest, VirtualListItemsResult } from '../src/virtual-list-types'
import type { VirtualListScenarioApi, VirtualListStats } from './scenario-api'

const TEAMS = ['Analytics', 'Compilers', 'Research', 'Flight', 'Networks']
const NAMES = ['Ada Lovelace', 'Grace Hopper', 'Alan Turing', 'Katherine Johnson', 'Radia Perlman', 'Barbara Liskov', 'Margaret Hamilton']

export interface Person {
  id: string
  name: string
  team: string
  score: number
}

/** Deterministic people: the same index always produces the same person, so runs are comparable. */
function makePeople(count: number, offset = 0): Person[] {
  const people: Person[] = new Array(count)
  for (let index = 0; index < count; index++) {
    const seed = index + offset
    people[index] = {
      id: String(seed + 1),
      name: `${NAMES[seed % NAMES.length]} ${seed + 1}`,
      team: TEAMS[seed % TEAMS.length],
      score: ((seed * 7919) % 90000) + 10000,
    }
  }
  return people
}

function subject(): VirtualList {
  const element = document.querySelector('c2-virtual-list')
  if (!element) throw new Error('No c2-virtual-list in the scenario')
  return element
}

function viewport(): HTMLElement {
  return subject().shadowRoot!.querySelector<HTMLElement>('.viewport')!
}

function rows(): HTMLElement[] {
  return [...subject().shadowRoot!.querySelectorAll<HTMLElement>('.item')]
}

/** Two frames: one for the scroll event the controller listens to, one for the render it then requests. */
async function settle(): Promise<void> {
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  await subject().updateComplete
}

let requests = 0
let gate: Promise<void> | undefined
let openGate: (() => void) | undefined

const api: VirtualListScenarioApi = {
  async fill(count) {
    const list = subject()
    list.items = makePeople(count)
    await list.updateComplete
  },

  async useDataSource(total) {
    requests = 0
    const everything = makePeople(total)
    const list = subject()
    list.dataSource = {
      async getItems(request: VirtualListItemsRequest): Promise<VirtualListItemsResult> {
        requests++
        if (gate) await gate
        const query = request.search.toLowerCase()
        let matching = query ? everything.filter((person) => person.name.toLowerCase().includes(query)) : everything
        if (request.sort?.field === 'score') {
          const direction = request.sort.direction === 'desc' ? -1 : 1
          matching = [...matching].sort((a, b) => direction * (a.score - b.score))
        }
        return { items: matching.slice(request.start, request.start + request.count), total: matching.length }
      },
    }
    await settle()
  },

  hold() {
    gate = new Promise<void>((resolve) => (openGate = resolve))
  },

  async release() {
    openGate?.()
    gate = undefined
    openGate = undefined
    await settle()
  },

  requestCount: () => requests,

  stats(): VirtualListStats {
    const rendered = rows()
    const indices = rendered.map((row) => Number(row.dataset.index))
    const element = viewport()
    return {
      renderedItems: rendered.length,
      shadowElements: subject().shadowRoot!.querySelectorAll('*').length,
      firstIndex: indices.length ? Math.min(...indices) : -1,
      lastIndex: indices.length ? Math.max(...indices) : -1,
      scrollHeight: element.scrollHeight,
      scrollTop: element.scrollTop,
    }
  },

  async scrollTo(top) {
    viewport().scrollTop = top
    await settle()
  },

  settle,
}

window.virtualListScenario = api
document.documentElement.dataset.modulesReady = 'true'
