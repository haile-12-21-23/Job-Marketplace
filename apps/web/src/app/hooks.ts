import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from './store.js';

// Pre-typed hooks for the web application
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
