import Error, { type ErrorProps } from 'next/error';
import type { NextPageContext } from 'next';

function CustomErrorPage({ statusCode }: ErrorProps) {
  return <Error statusCode={statusCode} />;
}

CustomErrorPage.getInitialProps = ({ res, err }: NextPageContext) => {
  const statusCode = res ? res.statusCode : err?.statusCode ?? 500;
  return { statusCode };
};

export default CustomErrorPage;
