import { FeedData } from '@dailydotdev/shared/src/graphql/posts';
import {
  ANONYMOUS_FEED_QUERY,
  FEED_QUERY,
  RankingAlgorithm,
} from '@dailydotdev/shared/src/graphql/feed';
import nock from 'nock';
import React from 'react';
import { render, RenderResult, screen, waitFor } from '@testing-library/react';
import { QueryClient } from 'react-query';
import { LoggedUser } from '@dailydotdev/shared/src/lib/user';
import { mocked } from 'ts-jest/utils';
import { NextRouter, useRouter } from 'next/router';
import ad from '@dailydotdev/shared/__tests__/fixture/ad';
import defaultUser from '@dailydotdev/shared/__tests__/fixture/loggedUser';
import defaultFeedPage from '@dailydotdev/shared/__tests__/fixture/feed';
import { Alerts, UPDATE_ALERTS } from '@dailydotdev/shared/src/graphql/alerts';
import { filterAlertMessage } from '@dailydotdev/shared/src/components/filters/FeedFilters';
import { TestBootProvider } from '@dailydotdev/shared/__tests__/helpers/boot';
import {
  MockedGraphQLResponse,
  mockGraphQL,
} from '@dailydotdev/shared/__tests__/helpers/graphql';
import MyFeed from '../pages/my-feed';

jest.mock('next/router', () => ({
  useRouter: jest.fn(),
}));

let defaultAlerts: Alerts = { filter: true };
const updateAlerts = jest.fn();

beforeEach(() => {
  defaultAlerts = { filter: true };
  jest.restoreAllMocks();
  jest.clearAllMocks();
  nock.cleanAll();
  mocked(useRouter).mockImplementation(
    () =>
      ({
        pathname: '/my-feed',
        query: {},
        replace: jest.fn(),
        push: jest.fn(),
      } as unknown as NextRouter),
  );
});

const createFeedMock = (
  page = defaultFeedPage,
  query: string = ANONYMOUS_FEED_QUERY,
  variables: unknown = {
    first: 7,
    loggedIn: true,
  },
): MockedGraphQLResponse<FeedData> => ({
  request: {
    query,
    variables,
  },
  result: {
    data: {
      page,
    },
  },
});
let client: QueryClient;

const renderComponent = (
  mocks: MockedGraphQLResponse[] = [createFeedMock()],
  user: LoggedUser = defaultUser,
): RenderResult => {
  client = new QueryClient();

  mocks.forEach(mockGraphQL);
  nock('http://localhost:3000').get('/v1/a').reply(200, [ad]);
  return render(
    <TestBootProvider
      client={client}
      auth={{ user }}
      alerts={{ alerts: defaultAlerts, updateAlerts }}
    >
      {MyFeed.getLayout(<MyFeed />, {}, MyFeed.layoutProps)}
    </TestBootProvider>,
  );
};

it('should request user feed', async () => {
  renderComponent([
    createFeedMock(defaultFeedPage, FEED_QUERY, {
      first: 7,
      loggedIn: true,
      version: 15,
      ranking: RankingAlgorithm.Popularity,
    }),
  ]);
  await waitFor(async () => {
    const elements = await screen.findAllByTestId('postItem');
    expect(elements.length).toBeTruthy();
  });
});

it('should request anonymous feed', async () => {
  renderComponent(
    [
      createFeedMock(defaultFeedPage, ANONYMOUS_FEED_QUERY, {
        first: 7,
        loggedIn: false,
        version: 15,
        ranking: RankingAlgorithm.Popularity,
      }),
    ],
    null,
  );
  await waitFor(async () => {
    const elements = await screen.findAllByTestId('postItem');
    expect(elements.length).toBeTruthy();
  });
});

it('should show the created message if the user added filters', async () => {
  defaultAlerts = { filter: false, myFeed: 'created' };
  renderComponent();
  const section = await screen.findByText(filterAlertMessage);
  expect(section).toBeInTheDocument();
});

it('should not show the my feed alert if the user removed it', async () => {
  defaultAlerts = { filter: false, myFeed: null };
  renderComponent();
  await waitFor(() =>
    expect(screen.queryByText(filterAlertMessage)).not.toBeInTheDocument(),
  );
});

it('should remove the my feed alert if the user clicks the cross', async () => {
  let mutationCalled = false;
  mockGraphQL({
    request: {
      query: UPDATE_ALERTS,
      variables: { data: { myFeed: null } },
    },
    result: () => {
      mutationCalled = true;
      return { data: { _: true } };
    },
  });
  defaultAlerts = { filter: false, myFeed: 'created' };
  renderComponent();

  const closeButton = await screen.findByTestId('alert-close');
  closeButton.click();

  await waitFor(() => {
    expect(updateAlerts).toBeCalledWith({ filter: false, myFeed: null });
    expect(mutationCalled).toBeTruthy();
  });
});
