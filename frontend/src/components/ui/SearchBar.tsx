import { useEffect, useId, useState, type FormEvent } from 'react';
import { Search } from 'lucide-react';

interface Props {
  initialValue?: string;
  placeholder?: string;
  buttonLabel?: string;
  label?: string;
  onSearch: (value: string) => void;
}

export const SearchBar = ({ initialValue = '', placeholder = 'Search doctors or specialties', buttonLabel = 'Search', label = 'Search doctors', onSearch }: Props) => {
  const [value, setValue] = useState(initialValue);
  const inputId = useId();

  useEffect(() => setValue(initialValue), [initialValue]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSearch(value.trim());
  };

  return (
    <form className="search-bar" role="search" onSubmit={submit}>
      <label className="visually-hidden" htmlFor={inputId}>
        {label}
      </label>
      <Search size={20} className="search-icon" aria-hidden="true" />
      <input
        id={inputId}
        type="search"
        className="search-input"
        placeholder={placeholder}
        value={value}
        maxLength={80}
        onChange={(e) => setValue(e.target.value)}
      />
      <button type="submit" className="btn btn-primary btn-md">
        {buttonLabel}
      </button>
    </form>
  );
};
