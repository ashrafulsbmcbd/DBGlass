import { delay } from 'redux-saga';
import { take, takeEvery, cps, put, fork } from 'redux-saga/effects';

import {
  fillTables as fillTablesAction,
  selectTable as selectTableAction,
  setTableData as setTableDataAction,
  fetchTableData as fetchTableDataAction,
  dropTable as dropTableAction,
} from '../actions/tables';
import { executeSQL, executeAndNormalizeSelectSQL } from '../utils/pgDB';

import { addFavoriteTablesQuantity } from '../actions/favorites';
import {
  toggleIsFetchedTables as toggleIsFetchedTablesAction,
  setDataForMeasure as setDataForMeasureAction,
} from '../actions/ui';


function* saveData({ dataForMeasure, data }) {
  yield put(setDataForMeasureAction(dataForMeasure));
  yield delay(100); // This delay needs to measure cells

  yield put(setTableDataAction(data));
}

export function* fetchTables() {
  while (true) {
    const { payload } = yield take('tables/FETCH_REQUEST');
    const query = `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema='public'
      AND table_type='BASE TABLE'
    `;

    const result = yield cps(executeSQL, query, []);
    const tablesIds = [];
    const tables = {};
    result.rows.map((t, i) => {
      const id = (i + 1).toString();
      tablesIds.push(id);
      tables[id] = {
        id,
        tableName: t.table_name,
        isFetched: false,
      };
      return id;
    });
    yield put(fillTablesAction({
      ids: tablesIds,
      map: tables,
    }));

    yield put(toggleIsFetchedTablesAction(true));

    if (payload) {
      yield put(addFavoriteTablesQuantity({
        currentFavoriteId: payload, quantity: tablesIds.length,
      }));
    }

    if (tablesIds.length) {
      yield put(selectTableAction(tables[tablesIds[0]].id));
      yield put(fetchTableDataAction({
        id: tables[tablesIds[0]].id,
        tableName: tables[tablesIds[0]].tableName,
        isFetched: false,
      }));
    }
  }
}

function* fetchTableData({ payload: { id, tableName, isFetched } }) {
  if (!isFetched) {
    const query = `
      SELECT *
      FROM ${tableName}
      LIMIT 1000
    `;
    const result = yield cps(executeAndNormalizeSelectSQL, query, { id });
    yield fork(saveData, result);
  }
}

export function* dropTable() {
  const { payload: { tableName, parameters } } = yield take('tables/DROP_TABLE_REQUEST');
  const query = `DROP TABLE ${tableName}`;
  yield cps(executeSQL, query, []);
  yield put(dropTableAction(tableName));
}

export function* fetchTableDataWatch() {
  yield takeEvery('tables/FETCH_TABLE_DATA_REQUEST', fetchTableData);
}
